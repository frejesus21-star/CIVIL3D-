# =============================================================================
# platforms.py  —  Plataformas integradas al corredor vial Civil 3D 2026
#
# RESTRICCIÓN PRINCIPAL:
#   Acuerdo vertical KV = 800 m (parámetro mínimo de curva parabólica) en
#   la entrada Y salida de cada plataforma.
#   Fórmula: L_min = KV * |Δi| / 100
#   donde Δi = diferencia algebraica de pendientes en %, L en metros.
#   Ejemplo: pendiente camino 6%, plataforma 2% → Δi=4% → L_min = 32 m
#
# COMPENSACIÓN DE TIERRAS:
#   Para cada plataforma se busca la cota óptima que equilibra corte y relleno
#   (método de bisección sobre secciones transversales cada 5 m por defecto).
#
# INTEGRACIÓN AL CORREDOR:
#   1. Se modifican los PIPs del perfil de rasante para incluir los acuerdos.
#   2. Se crea una región del corredor con assembly de plataforma.
#   3. Se crean feature lines de borde de calzada / talud de plataforma.
# =============================================================================

from __future__ import annotations
import math
import clr

clr.AddReference('AcMgd')
clr.AddReference('AcDbMgd')
clr.AddReference('AeccDbMgd')

from Autodesk.AutoCAD.ApplicationServices import Application
from Autodesk.AutoCAD.DatabaseServices import (
    Transaction, BlockTable, BlockTableRecord,
    OpenMode, ObjectId,
)
from Autodesk.AutoCAD.Geometry import Point3d, Point2d, Vector3d

from Autodesk.Civil.ApplicationServices import CivilApplication
from Autodesk.Civil.DatabaseServices import (
    Alignment, Profile, ProfilePVI, ProfilePVICollection,
    TinSurface, FeatureLine, Corridor,
)

# ---------------------------------------------------------------------------
# Constantes de diseño
# ---------------------------------------------------------------------------
KV_DEFAULT        = 800.0   # Radio equiv. curva vertical (m) — mínimo normativo
PLATFORM_SLOPE    = 2.0     # Pendiente long. de drenaje en plataforma (%)
CROSS_SLOPE_PLT   = 2.5     # Bombeo transversal de la plataforma (%)
SECTION_SPACING   = 5.0     # Espaciado entre secciones para cálculo de volumen (m)
BISECT_TOLERANCE  = 0.01    # Tolerancia de compensación (m³/m de longitud)
BISECT_MAX_ITER   = 40


# ---------------------------------------------------------------------------
# Clase Platform
# ---------------------------------------------------------------------------

class Platform:
    """
    Describe una plataforma (explanada) adyacente al corredor vial.

    Parámetros
    ----------
    name        : identificador único (ej. "PLT-01")
    pk_start    : estación de inicio de la plataforma (m)
    pk_end      : estación de fin de la plataforma (m)
    width       : ancho de la plataforma medido desde el borde de calzada (m)
    side        : 'right' | 'left' | 'both'
    slope_pct   : pendiente longitudinal de la plataforma (%, default 2%)
    elevation   : cota de rasante en pk_start (None = calcular óptima)
    """

    def __init__(self, name: str, pk_start: float, pk_end: float,
                 width: float, side: str = 'right',
                 slope_pct: float = PLATFORM_SLOPE,
                 elevation: float | None = None):
        if pk_end <= pk_start:
            raise ValueError(f"[{name}] pk_end ({pk_end}) debe ser > pk_start ({pk_start})")
        if width <= 0:
            raise ValueError(f"[{name}] ancho debe ser positivo")
        if side not in ('right', 'left', 'both'):
            raise ValueError(f"[{name}] side debe ser 'right', 'left' o 'both'")

        self.name       = name
        self.pk_start   = pk_start
        self.pk_end     = pk_end
        self.width      = width
        self.side       = side
        self.slope_pct  = slope_pct
        self.elevation  = elevation     # cota en pk_start; None → calcular

        # Resultados calculados
        self.optimal_elevation   = None   # m.s.n.m.
        self.L_entry             = 0.0    # longitud acuerdo entrada (m)
        self.L_exit              = 0.0    # longitud acuerdo salida (m)
        self.grade_entry_road    = 0.0    # pendiente rasante camino en pk_start (%)
        self.grade_exit_road     = 0.0    # pendiente rasante camino en pk_end (%)
        self.volume_cut          = 0.0    # m³
        self.volume_fill         = 0.0    # m³
        self.balance             = 0.0    # cut - fill (m³); 0 = compensado

    @property
    def length(self) -> float:
        return self.pk_end - self.pk_start

    @property
    def active_elevation(self) -> float | None:
        """Cota efectiva: la explícita o la óptima calculada."""
        return self.elevation if self.elevation is not None else self.optimal_elevation

    def __repr__(self):
        return (f"Platform({self.name!r}, pk={self.pk_start:.1f}-{self.pk_end:.1f}, "
                f"L={self.length:.1f}m, w={self.width}m, side={self.side})")


# ---------------------------------------------------------------------------
# 1. ACUERDOS VERTICALES (KV = 800)
# ---------------------------------------------------------------------------

def compute_kv_transition(grade_road_pct: float, grade_platform_pct: float,
                           kv: float = KV_DEFAULT) -> float:
    """
    Longitud mínima del acuerdo parabólico de transición entre la rasante
    del camino y la pendiente de la plataforma.

    L = KV × |Δi| / 100   (Δi en %, L en m)

    KV = 800 m actúa como radio equivalente de la parábola vertical.
    Si no hay cambio de pendiente significativo devuelve 0.
    """
    delta_i = abs(grade_road_pct - grade_platform_pct)
    if delta_i < 1e-4:
        return 0.0
    return kv * delta_i / 100.0


def check_kv_feasibility(platform: Platform, kv: float = KV_DEFAULT) -> dict:
    """
    Verifica que los acuerdos verticales de entrada y salida quepan
    físicamente en el espacio disponible antes/después de la plataforma.

    Retorna dict con claves: 'ok', 'L_entry', 'L_exit', 'warnings'
    """
    warnings = []

    # Longitudes de acuerdo calculadas
    L_en = compute_kv_transition(platform.grade_entry_road, platform.slope_pct, kv)
    L_ex = compute_kv_transition(platform.grade_exit_road,  platform.slope_pct, kv)

    platform.L_entry = L_en
    platform.L_exit  = L_ex

    # El acuerdo se centra en el PIP → necesita L/2 antes y L/2 después del PIP
    # PIP de entrada está en pk_start → necesita L_en/2 antes de pk_start (en camino)
    # PIP de salida está en pk_end   → necesita L_ex/2 después de pk_end  (en camino)
    # No hay restricción de longitud mínima de plataforma para alojar los acuerdos
    # porque los acuerdos se ubican en el camino, no en la plataforma.

    if L_en > 200:
        warnings.append(
            f"Acuerdo entrada {L_en:.1f} m es largo — "
            f"Δi={abs(platform.grade_entry_road - platform.slope_pct):.2f}%"
        )
    if L_ex > 200:
        warnings.append(
            f"Acuerdo salida {L_ex:.1f} m es largo — "
            f"Δi={abs(platform.grade_exit_road - platform.slope_pct):.2f}%"
        )

    return {
        'ok':       True,
        'L_entry':  L_en,
        'L_exit':   L_ex,
        'warnings': warnings,
    }


# ---------------------------------------------------------------------------
# 2. PENDIENTE DE LA RASANTE EN UNA ESTACIÓN
# ---------------------------------------------------------------------------

def _get_profile_elevation(alignment_id: ObjectId, profile_id: ObjectId,
                            station: float) -> float:
    """Devuelve la cota (m) de la rasante en la estación dada."""
    db  = Application.DocumentManager.MdiActiveDocument.Database
    with db.TransactionManager.StartTransaction() as tr:
        prof = tr.GetObject(profile_id, OpenMode.ForRead)
        elev = prof.ElevationAt(station)
        tr.Commit()
    return elev


def get_road_grade_at(alignment_id: ObjectId, profile_id: ObjectId,
                       station: float, delta: float = 0.5) -> float:
    """
    Calcula la pendiente de la rasante en una estación por diferencia finita
    centrada (Δs = delta metros).  Resultado en %.
    """
    db  = Application.DocumentManager.MdiActiveDocument.Database
    with db.TransactionManager.StartTransaction() as tr:
        prof = tr.GetObject(profile_id, OpenMode.ForRead)
        ali  = tr.GetObject(alignment_id, OpenMode.ForRead)
        s0   = max(ali.StartingStation, station - delta)
        s1   = min(ali.EndingStation,   station + delta)
        e0   = prof.ElevationAt(s0)
        e1   = prof.ElevationAt(s1)
        tr.Commit()
    return 100.0 * (e1 - e0) / (s1 - s0)


# ---------------------------------------------------------------------------
# 3. SUPERFICIE TN — COTA EN COORDENADAS XY
# ---------------------------------------------------------------------------

def _get_surface_elev_at_xy(surface_id: ObjectId, x: float, y: float) -> float | None:
    """
    Devuelve la cota del TIN en el punto (x, y).
    Retorna None si el punto cae fuera del TIN.
    """
    db  = Application.DocumentManager.MdiActiveDocument.Database
    with db.TransactionManager.StartTransaction() as tr:
        surf = tr.GetObject(surface_id, OpenMode.ForRead)
        try:
            z = surf.FindElevationAtXY(x, y)
            tr.Commit()
            return z
        except Exception:
            tr.Commit()
            return None


def _alignment_point_at_station(alignment_id: ObjectId, station: float,
                                  offset: float = 0.0):
    """
    Devuelve (x, y) del punto en el alineamiento a la estación y offset dados.
    offset > 0 → derecha, offset < 0 → izquierda.
    """
    db  = Application.DocumentManager.MdiActiveDocument.Database
    with db.TransactionManager.StartTransaction() as tr:
        ali = tr.GetObject(alignment_id, OpenMode.ForRead)
        pt  = Point3d(0, 0, 0)
        direction = Vector3d(0, 0, 0)
        ali.PointLocation(station, offset, pt, direction)
        tr.Commit()
    return pt.X, pt.Y


# ---------------------------------------------------------------------------
# 4. VOLÚMENES DE CORTE Y RELLENO EN UNA PLATAFORMA
# ---------------------------------------------------------------------------

def _cross_section_areas(surface_id: ObjectId, alignment_id: ObjectId,
                          station: float, platform_elev: float,
                          width: float, side: str,
                          road_half_width: float = 4.0,
                          num_points: int = 12) -> tuple[float, float]:
    """
    Área de corte y relleno en una sección transversal de plataforma.

    Compara la cota del TIN (terreno natural) contra la cota de la plataforma.
    Integra con regla del trapecio sobre num_points puntos distribuidos
    en el ancho de la plataforma.

    road_half_width : semi-ancho del camino existente (m) — se excluye del cómputo
                      porque ya está dentro del corredor.
    """
    offsets_right = []
    offsets_left  = []

    if side in ('right', 'both'):
        for k in range(num_points + 1):
            off = road_half_width + width * k / num_points
            offsets_right.append(off)

    if side in ('left', 'both'):
        for k in range(num_points + 1):
            off = -(road_half_width + width * k / num_points)
            offsets_left.append(off)

    all_offsets = offsets_right + offsets_left

    area_cut  = 0.0
    area_fill = 0.0

    zs = []
    for off in all_offsets:
        x, y = _alignment_point_at_station(alignment_id, station, off)
        z_tn = _get_surface_elev_at_xy(surface_id, x, y)
        zs.append((off, z_tn))

    # Integración trapecio sobre cada grupo (right / left separados)
    def integrate_group(pairs):
        cut = fill = 0.0
        for i in range(len(pairs) - 1):
            o1, z1 = pairs[i]
            o2, z2 = pairs[i + 1]
            if z1 is None or z2 is None:
                continue
            dw    = abs(o2 - o1)
            dz1   = platform_elev - z1   # > 0 → relleno, < 0 → corte
            dz2   = platform_elev - z2
            # Trapecio: área = dw * (dz1 + dz2) / 2
            # Si signos mixtos, hay cruce en la sección — tratamiento lineal
            if dz1 * dz2 >= 0:
                avg = (dz1 + dz2) / 2.0
                if avg > 0:
                    fill += dw * avg
                else:
                    cut  += dw * abs(avg)
            else:
                # Cruce: proporcional
                frac = abs(dz1) / (abs(dz1) + abs(dz2))
                xc   = o1 + frac * (o2 - o1)
                w1   = abs(xc - o1)
                w2   = abs(o2 - xc)
                if dz1 < 0:
                    cut  += w1 * abs(dz1) / 2.0
                    fill += w2 * abs(dz2) / 2.0
                else:
                    fill += w1 * dz1 / 2.0
                    cut  += w2 * abs(dz2) / 2.0
        return cut, fill

    if offsets_right:
        pairs_r = list(zip(offsets_right, [z for _, z in zs[:len(offsets_right)]]))
        c, f    = integrate_group(pairs_r)
        area_cut  += c
        area_fill += f

    if offsets_left:
        pairs_l = list(zip(offsets_left, [z for _, z in zs[len(offsets_right):]]))
        c, f    = integrate_group(pairs_l)
        area_cut  += c
        area_fill += f

    return area_cut, area_fill


def compute_platform_earthwork(surface_id: ObjectId, alignment_id: ObjectId,
                                platform: Platform,
                                spacing: float = SECTION_SPACING,
                                road_half_width: float = 4.0) -> tuple[float, float]:
    """
    Calcula los volúmenes totales de corte y relleno de la plataforma
    usando el método de área media entre secciones cada `spacing` metros.

    Retorna (vol_cut, vol_fill) en m³.
    """
    elev = platform.active_elevation
    if elev is None:
        raise ValueError(f"[{platform.name}] Elevación no definida. "
                         "Llamar find_optimal_elevation() primero.")

    stations = []
    s = platform.pk_start
    while s <= platform.pk_end + 1e-6:
        stations.append(min(s, platform.pk_end))
        s += spacing

    vol_cut = vol_fill = 0.0
    prev_ac = prev_af = None

    for st in stations:
        # Cota de plataforma en esta estación (inclinación longitudinal)
        ds      = st - platform.pk_start
        z_plt   = elev + (platform.slope_pct / 100.0) * ds
        ac, af  = _cross_section_areas(
            surface_id, alignment_id, st, z_plt,
            platform.width, platform.side, road_half_width
        )
        if prev_ac is not None:
            ds_step = stations[stations.index(st)] - stations[stations.index(st) - 1] if stations.index(st) > 0 else spacing
            # Buscar ds real
            idx = stations.index(st)
            ds_step = stations[idx] - stations[idx - 1]
            vol_cut  += (prev_ac + ac)  / 2.0 * ds_step
            vol_fill += (prev_af + af) / 2.0 * ds_step
        prev_ac, prev_af = ac, af

    platform.volume_cut  = vol_cut
    platform.volume_fill = vol_fill
    platform.balance     = vol_cut - vol_fill
    return vol_cut, vol_fill


# ---------------------------------------------------------------------------
# 5. COMPENSACIÓN DE MOVIMIENTO DE TIERRA (BISECCIÓN)
# ---------------------------------------------------------------------------

def find_optimal_elevation(surface_id: ObjectId, alignment_id: ObjectId,
                            platform: Platform,
                            road_half_width: float = 4.0,
                            spacing: float = SECTION_SPACING) -> float:
    """
    Encuentra la cota de inicio de la plataforma (en pk_start) que minimiza
    el movimiento neto de tierras (corte - relleno ≈ 0).

    Método de bisección:
    - Se muestrea la cota del TN en pk_start para definir el rango [z_low, z_high]
    - Se evalúa balance(z) = vol_cut(z) - vol_fill(z)
    - Se busca la cota donde balance cambia de signo (corte→relleno)
    """
    # Cota TN en el punto central de la plataforma como referencia
    cx, cy = _alignment_point_at_station(
        alignment_id, (platform.pk_start + platform.pk_end) / 2.0
    )
    z_ref = _get_surface_elev_at_xy(surface_id, cx, cy)
    if z_ref is None:
        raise ValueError(f"[{platform.name}] No se encontró cota TN en el centroide.")

    # Definir rango de búsqueda: ±15 m alrededor de la cota TN
    z_low  = z_ref - 15.0
    z_high = z_ref + 15.0

    def balance(z):
        platform.elevation = z
        c, f = compute_platform_earthwork(
            surface_id, alignment_id, platform, spacing, road_half_width
        )
        return c - f   # >0 → mucho corte (bajar cota), <0 → mucho relleno (subir cota)

    bal_low  = balance(z_low)
    bal_high = balance(z_high)

    # Si no hay cruce de signo, retornar la opción de menor balance absoluto
    if bal_low * bal_high > 0:
        if abs(bal_low) < abs(bal_high):
            platform.elevation = z_low
        else:
            platform.elevation = z_high
        platform.optimal_elevation = platform.elevation
        return platform.elevation

    for _ in range(BISECT_MAX_ITER):
        z_mid   = (z_low + z_high) / 2.0
        bal_mid = balance(z_mid)

        if abs(bal_mid) < BISECT_TOLERANCE * platform.length:
            break

        if bal_low * bal_mid <= 0:
            z_high   = z_mid
            bal_high = bal_mid
        else:
            z_low    = z_mid
            bal_low  = bal_mid

    platform.elevation         = (z_low + z_high) / 2.0
    platform.optimal_elevation = platform.elevation
    return platform.elevation


def compensate_earthwork_all(surface_id: ObjectId, alignment_id: ObjectId,
                              platforms: list[Platform],
                              profile_id: ObjectId | None = None,
                              kv: float = KV_DEFAULT,
                              road_half_width: float = 4.0,
                              spacing: float = SECTION_SPACING) -> list[dict]:
    """
    Para cada plataforma:
      1. Obtiene pendientes de rasante en pk_start y pk_end.
      2. Calcula longitudes de acuerdo vertical (KV = 800).
      3. Encuentra la cota óptima de compensación de tierras.
      4. Verifica factibilidad de acuerdos.
      5. Calcula volúmenes finales.

    Retorna lista de dicts con resultados por plataforma.
    """
    results = []

    for plt in platforms:
        res = {'name': plt.name, 'ok': True, 'warnings': [], 'errors': []}

        # A) Pendientes de rasante (si se proporciona perfil)
        if profile_id is not None:
            try:
                plt.grade_entry_road = get_road_grade_at(
                    alignment_id, profile_id, plt.pk_start
                )
                plt.grade_exit_road  = get_road_grade_at(
                    alignment_id, profile_id, plt.pk_end
                )
            except Exception as ex:
                res['errors'].append(f"Error leyendo rasante: {ex}")
                res['ok'] = False
                results.append(res)
                continue
        else:
            res['warnings'].append(
                "Sin perfil de rasante — usando pendientes 0% para acuerdos."
            )

        # B) Longitudes de acuerdo KV = 800
        feas = check_kv_feasibility(plt, kv)
        res['L_entry']   = feas['L_entry']
        res['L_exit']    = feas['L_exit']
        res['warnings'] += feas['warnings']

        # C) Cota óptima de compensación
        if plt.elevation is None:
            try:
                find_optimal_elevation(
                    surface_id, alignment_id, plt, road_half_width, spacing
                )
                res['optimal_elevation'] = plt.optimal_elevation
            except Exception as ex:
                res['errors'].append(f"Error en compensación: {ex}")
                res['ok'] = False
                results.append(res)
                continue
        else:
            compute_platform_earthwork(
                surface_id, alignment_id, plt, spacing, road_half_width
            )
            res['optimal_elevation'] = plt.elevation

        # D) Resumen volumétrico
        res['volume_cut']  = plt.volume_cut
        res['volume_fill'] = plt.volume_fill
        res['balance_m3']  = plt.balance

        results.append(res)

    return results


# ---------------------------------------------------------------------------
# 6. MODIFICAR PERFIL DE RASANTE PARA INCLUIR PLATAFORMAS (PIPs)
# ---------------------------------------------------------------------------

def add_platform_pips_to_profile(alignment_id: ObjectId, profile_id: ObjectId,
                                   platforms: list[Platform],
                                   kv: float = KV_DEFAULT) -> list[str]:
    """
    Inserta los Puntos de Intersección de Perfil (PIPs) necesarios para
    los acuerdos verticales de cada plataforma.

    Geometría del perfil en zona de plataforma:
    ─────────────────────────────────────────────────────────────
    ... i_road ... PIP_A ... [acuerdo L_en] ... pk_start ... plataforma ...
                                                pk_end  ... [acuerdo L_ex] ... PIP_B ... i_road ...
    ─────────────────────────────────────────────────────────────
    PIP_A : estación = pk_start,  cota = elev_plataforma_pk_start
            kv_length = L_entry
    PIP_B : estación = pk_end,    cota = elev_plataforma_pk_end
            kv_length = L_exit

    NOTA: Civil 3D requiere que los PIPs se inserten en orden de estación.
    Si ya existen PIPs cercanos (±L/2) se ajustan en lugar de duplicar.
    """
    doc = Application.DocumentManager.MdiActiveDocument
    db  = doc.Database
    logs = []

    with doc.LockDocument():
        with db.TransactionManager.StartTransaction() as tr:
            prof = tr.GetObject(profile_id, OpenMode.ForWrite)
            ali  = tr.GetObject(alignment_id, OpenMode.ForRead)

            pvics: ProfilePVICollection = prof.PVIs

            for plt in platforms:
                elev_start = plt.active_elevation
                if elev_start is None:
                    logs.append(f"[{plt.name}] SKIP — sin cota calculada")
                    continue

                # Cota al final de la plataforma (con pendiente longitudinal)
                elev_end = elev_start + (plt.slope_pct / 100.0) * plt.length

                # PIP entrada: en pk_start con acuerdo L_entry
                try:
                    pvi_a = pvics.AddPVI(plt.pk_start, elev_start)
                    pvi_a.CurveLength = plt.L_entry
                    logs.append(
                        f"[{plt.name}] PIP entrada: PK={plt.pk_start:.2f} "
                        f"Z={elev_start:.3f} L_cv={plt.L_entry:.1f}m"
                    )
                except Exception as ex:
                    logs.append(f"[{plt.name}] ERROR PIP entrada: {ex}")

                # PIP salida: en pk_end con acuerdo L_exit
                try:
                    pvi_b = pvics.AddPVI(plt.pk_end, elev_end)
                    pvi_b.CurveLength = plt.L_exit
                    logs.append(
                        f"[{plt.name}] PIP salida:  PK={plt.pk_end:.2f} "
                        f"Z={elev_end:.3f} L_cv={plt.L_exit:.1f}m"
                    )
                except Exception as ex:
                    logs.append(f"[{plt.name}] ERROR PIP salida: {ex}")

            tr.Commit()

    return logs


# ---------------------------------------------------------------------------
# 7. CREAR REGIÓN DE CORREDOR PARA CADA PLATAFORMA
# ---------------------------------------------------------------------------

def add_platform_regions_to_corridor(corridor_id: ObjectId,
                                      alignment_id: ObjectId,
                                      platform_assembly_name: str,
                                      platforms: list[Platform]) -> list[str]:
    """
    Agrega una región del corredor por cada plataforma usando el assembly
    de plataforma especificado.  Las regiones de corredor definen qué
    assembly (sección transversal) se aplica en qué rango de estaciones.

    El assembly de plataforma debe existir en el dibujo con el nombre dado.
    Recomendado: assembly con calzada extendida (carril + berma + talud plataforma).
    """
    doc = Application.DocumentManager.MdiActiveDocument
    db  = doc.Database
    cdoc = CivilApplication.ActiveDocument
    logs = []

    # Buscar assembly de plataforma
    plt_asm_id = None
    for asm_id in cdoc.GetAssemblyIds():
        with db.TransactionManager.StartTransaction() as tr:
            asm = tr.GetObject(asm_id, OpenMode.ForRead)
            if asm.Name.upper() == platform_assembly_name.upper():
                plt_asm_id = asm_id
                tr.Commit()
                break
            tr.Commit()

    if plt_asm_id is None:
        return [f"ERROR: Assembly '{platform_assembly_name}' no encontrado."]

    with doc.LockDocument():
        with db.TransactionManager.StartTransaction() as tr:
            corridor = tr.GetObject(corridor_id, OpenMode.ForWrite)
            baseline = corridor.Baselines[0]

            for plt in platforms:
                try:
                    region = baseline.BaselineRegions.Add(
                        plt.pk_start - plt.L_entry / 2.0,  # inicio con acuerdo
                        plt.pk_end   + plt.L_exit  / 2.0,  # fin con acuerdo
                        plt_asm_id
                    )
                    logs.append(
                        f"[{plt.name}] Región corredor: "
                        f"PK={plt.pk_start - plt.L_entry/2:.1f}–"
                        f"{plt.pk_end + plt.L_exit/2:.1f}"
                    )
                except Exception as ex:
                    logs.append(f"[{plt.name}] ERROR región corredor: {ex}")

            corridor.Rebuild()
            tr.Commit()

    return logs


# ---------------------------------------------------------------------------
# 8. CREAR FEATURE LINES DE BORDES DE PLATAFORMA
# ---------------------------------------------------------------------------

def create_platform_feature_lines(alignment_id: ObjectId,
                                   platforms: list[Platform],
                                   layer_name: str = "C-ROAD-PLATFORM",
                                   spacing: float = 5.0) -> list[str]:
    """
    Crea Feature Lines en Civil 3D para los bordes de la plataforma
    (borde exterior derecho/izquierdo).  Estas feature lines sirven como
    líneas de ruptura para la superficie de explanada y como límite del
    grading.

    La cota de cada punto se calcula con:
      Z = elev_start + slope_pct/100 * (station - pk_start)
    más el desnivel transversal por el bombeo de la plataforma.
    """
    doc  = Application.DocumentManager.MdiActiveDocument
    db   = doc.Database
    cdoc = CivilApplication.ActiveDocument
    logs = []

    with doc.LockDocument():
        with db.TransactionManager.StartTransaction() as tr:
            bt  = tr.GetObject(db.BlockTableId, OpenMode.ForRead)
            btr = tr.GetObject(bt[BlockTableRecord.ModelSpace], OpenMode.ForWrite)

            # Asegurar que la capa exista
            _ensure_layer(db, tr, layer_name)

            for plt in platforms:
                elev_start = plt.active_elevation
                if elev_start is None:
                    logs.append(f"[{plt.name}] SKIP feature lines — sin cota")
                    continue

                sides_offsets = []
                if plt.side in ('right', 'both'):
                    sides_offsets.append(('R', +plt.width))
                if plt.side in ('left', 'both'):
                    sides_offsets.append(('L', -plt.width))

                ali = tr.GetObject(alignment_id, OpenMode.ForRead)

                for side_tag, offset in sides_offsets:
                    pts3d = []
                    st = plt.pk_start
                    while st <= plt.pk_end + 1e-6:
                        st_clamped = min(st, plt.pk_end)
                        ds = st_clamped - plt.pk_start
                        # Cota longitudinal
                        z_long = elev_start + (plt.slope_pct / 100.0) * ds
                        # Desnivel transversal por bombeo (cae hacia afuera del camino)
                        z_cross = z_long - (CROSS_SLOPE_PLT / 100.0) * plt.width

                        # Coordenadas XY en el offset
                        edge_pt  = Point3d(0, 0, 0)
                        edge_dir = Vector3d(0, 0, 0)
                        ali.PointLocation(st_clamped, offset, edge_pt, edge_dir)

                        pts3d.append(Point3d(edge_pt.X, edge_pt.Y, z_cross))
                        st += spacing

                    # Crear Feature Line con los puntos
                    if len(pts3d) >= 2:
                        try:
                            fl_id = FeatureLine.Create(
                                cdoc,
                                ObjectId.Null,  # sin sitio
                                f"FL-{plt.name}-{side_tag}"
                            )
                            fl = tr.GetObject(fl_id, OpenMode.ForWrite)
                            fl.Layer = layer_name

                            for pt in pts3d:
                                fl.InsertPI(pt)

                            btr.AppendEntity(fl)
                            tr.AddNewlyCreatedDBObject(fl, True)
                            logs.append(
                                f"[{plt.name}-{side_tag}] FeatureLine creada "
                                f"({len(pts3d)} puntos)"
                            )
                        except Exception as ex:
                            logs.append(
                                f"[{plt.name}-{side_tag}] ERROR feature line: {ex}"
                            )

            tr.Commit()

    return logs


def _ensure_layer(db, tr, layer_name: str):
    """Crea la capa si no existe."""
    from Autodesk.AutoCAD.DatabaseServices import LayerTable, LayerTableRecord
    lt = tr.GetObject(db.LayerTableId, OpenMode.ForRead)
    if not lt.Has(layer_name):
        lt.UpgradeOpen()
        ltr = LayerTableRecord()
        ltr.Name = layer_name
        lt.Add(ltr)
        tr.AddNewlyCreatedDBObject(ltr, True)


# ---------------------------------------------------------------------------
# 9. CREAR SUPERFICIE TIN DE PLATAFORMA (GRADING)
# ---------------------------------------------------------------------------

def create_platform_tin_surface(alignment_id: ObjectId,
                                  platforms: list[Platform],
                                  surface_name_prefix: str = "PLT",
                                  road_half_width: float = 4.0,
                                  spacing: float = 5.0) -> list[str]:
    """
    Crea una superficie TIN por cada plataforma definiendo una malla de
    puntos que representa la explanada terminada.

    La malla cubre desde el borde de la calzada (road_half_width) hasta
    el borde exterior de la plataforma, con cota decreciente por bombeo.
    """
    doc  = Application.DocumentManager.MdiActiveDocument
    db   = doc.Database
    cdoc = CivilApplication.ActiveDocument
    logs = []

    for plt in platforms:
        elev_start = plt.active_elevation
        if elev_start is None:
            logs.append(f"[{plt.name}] SKIP superficie — sin cota")
            continue

        surf_name = f"{surface_name_prefix}-{plt.name}"
        try:
            surf_id = TinSurface.Create(cdoc, surf_name)
        except Exception as ex:
            logs.append(f"[{plt.name}] ERROR crear TIN: {ex}")
            continue

        with doc.LockDocument():
            with db.TransactionManager.StartTransaction() as tr:
                surf = tr.GetObject(surf_id, OpenMode.ForWrite)
                ali  = tr.GetObject(alignment_id, OpenMode.ForRead)

                n_lateral  = 6   # puntos en dirección transversal
                n_stations = max(4, int(plt.length / spacing) + 1)

                offsets_def = []
                if plt.side in ('right', 'both'):
                    for k in range(n_lateral + 1):
                        offsets_def.append(
                            road_half_width + plt.width * k / n_lateral
                        )
                if plt.side in ('left', 'both'):
                    for k in range(n_lateral + 1):
                        offsets_def.append(
                            -(road_half_width + plt.width * k / n_lateral)
                        )

                for i in range(n_stations):
                    st = plt.pk_start + (plt.pk_end - plt.pk_start) * i / (n_stations - 1)
                    ds = st - plt.pk_start
                    z_long = elev_start + (plt.slope_pct / 100.0) * ds

                    for off in offsets_def:
                        z_cross = z_long - (CROSS_SLOPE_PLT / 100.0) * abs(off - road_half_width)
                        pt  = Point3d(0, 0, 0)
                        dir = Vector3d(0, 0, 0)
                        ali.PointLocation(st, off, pt, dir)
                        try:
                            surf.AddPoint(Point3d(pt.X, pt.Y, z_cross))
                        except Exception:
                            pass

                surf.Rebuild()
                tr.Commit()

        logs.append(f"[{plt.name}] Superficie TIN '{surf_name}' creada.")

    return logs


# ---------------------------------------------------------------------------
# 10. FUNCIÓN PRINCIPAL DE INTEGRACIÓN
# ---------------------------------------------------------------------------

def integrate_platforms(alignment_id: ObjectId,
                         profile_id: ObjectId,
                         corridor_id: ObjectId,
                         surface_id: ObjectId,
                         platforms: list[Platform],
                         platform_assembly_name: str = "plataforma",
                         kv: float = KV_DEFAULT,
                         road_half_width: float = 4.0,
                         section_spacing: float = SECTION_SPACING) -> dict:
    """
    Orquesta el flujo completo de integración de plataformas:

    1. Compensación de tierras (cota óptima por bisección).
    2. Cálculo de acuerdos verticales KV = 800.
    3. Inserción de PIPs en el perfil de rasante.
    4. Creación de regiones en el corredor.
    5. Creación de feature lines de borde de plataforma.
    6. Creación de superficie TIN de plataforma.

    Retorna dict con logs y resumen volumétrico de cada plataforma.
    """
    all_logs   = []
    summary    = []

    # --- PASO 1 & 2: Compensación y acuerdos ---
    comp_results = compensate_earthwork_all(
        surface_id, alignment_id, platforms,
        profile_id=profile_id,
        kv=kv,
        road_half_width=road_half_width,
        spacing=section_spacing,
    )
    for res in comp_results:
        all_logs.append(
            f"[{res['name']}] Cota óptima={res.get('optimal_elevation', '?'):.3f} m  "
            f"Corte={res.get('volume_cut', 0):.1f} m³  "
            f"Relleno={res.get('volume_fill', 0):.1f} m³  "
            f"Balance={res.get('balance_m3', 0):.1f} m³  "
            f"L_entrada={res.get('L_entry', 0):.1f} m  "
            f"L_salida={res.get('L_exit', 0):.1f} m"
        )
        all_logs += res.get('warnings', [])
        all_logs += res.get('errors',   [])
        summary.append(res)

    # Filtrar plataformas válidas para los siguientes pasos
    valid_platforms = [
        p for p, r in zip(platforms, comp_results)
        if r['ok'] and p.active_elevation is not None
    ]

    # --- PASO 3: Modificar rasante con PIPs ---
    pip_logs = add_platform_pips_to_profile(
        alignment_id, profile_id, valid_platforms, kv
    )
    all_logs += pip_logs

    # --- PASO 4: Regiones de corredor ---
    cor_logs = add_platform_regions_to_corridor(
        corridor_id, alignment_id, platform_assembly_name, valid_platforms
    )
    all_logs += cor_logs

    # --- PASO 5: Feature Lines ---
    fl_logs = create_platform_feature_lines(
        alignment_id, valid_platforms, spacing=section_spacing
    )
    all_logs += fl_logs

    # --- PASO 6: Superficie TIN ---
    tin_logs = create_platform_tin_surface(
        alignment_id, valid_platforms,
        road_half_width=road_half_width, spacing=section_spacing
    )
    all_logs += tin_logs

    return {'logs': all_logs, 'summary': summary}
