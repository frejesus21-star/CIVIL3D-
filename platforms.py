# =============================================================================
# platforms.py  —  Plataformas integradas al corredor vial
#                  Compatible: Civil 3D 2020-2026  |  IronPython 2.7 (Dynamo)
#
# DISEÑO PORTÁTIL:
#   Todos los parámetros de proyecto se pasan como argumentos de función.
#   No hay ningún valor hardcodeado dependiente del proyecto.
#   Los nombres de superficies, perfiles, assemblies y capas se reciben
#   siempre como parámetros con valores por defecto descriptivos.
#
# RESTRICCIÓN ACUERDO VERTICAL:
#   L = KV × |Δi| / 100   (KV en m, Δi en %, L en m)
#   KV = 800 m (radio equivalente de parábola vertical) — configurable.
#
# COMPENSACIÓN DE TIERRAS:
#   Bisección numérica para hallar la cota donde corte = relleno.
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
    LayerTable, LayerTableRecord,
)
from Autodesk.AutoCAD.Geometry import Point3d, Vector3d

from Autodesk.Civil.ApplicationServices import CivilApplication
from Autodesk.Civil.DatabaseServices import (
    Alignment, Profile, ProfilePVI, ProfilePVICollection,
    TinSurface, FeatureLine, Corridor,
)

# ---------------------------------------------------------------------------
# Defaults documentados — todos sobreescribibles por el llamador
# ---------------------------------------------------------------------------
KV_DEFAULT           = 800.0   # Radio equiv. curva vertical (m)
PLATFORM_SLOPE_PCT   = 2.0     # Pendiente long. de drenaje (%)
CROSS_SLOPE_PCT      = 2.5     # Bombeo transversal (%)
SECTION_SPACING_M    = 5.0     # Espaciado entre secciones de volumen (m)
ROAD_HALF_WIDTH_M    = 4.0     # Semi-ancho de calzada por defecto (m)
BISECT_TOLERANCE     = 0.01    # Tolerancia balance m³/m de longitud
BISECT_MAX_ITER      = 40
LAYER_PLATFORM_FL    = "C-ROAD-PLATFORM"   # Capa de feature lines


# ===========================================================================
# CLASE PRINCIPAL
# ===========================================================================

class Platform:
    """
    Define una plataforma (explanada) adyacente al corredor.

    Todos los parámetros de diseño se reciben explícitamente para que
    el objeto sea independiente de cualquier proyecto concreto.

    Parámetros
    ----------
    name         : identificador único, ej. "PLT-01"
    pk_start     : estación de inicio (m)
    pk_end       : estación de fin (m)
    width        : ancho desde borde de calzada (m)
    side         : 'right' | 'left' | 'both'
    slope_pct    : pendiente longitudinal de la plataforma (%), default 2%
    elevation    : cota forzada en pk_start (None = calcular óptima)
    """

    __slots__ = (
        'name', 'pk_start', 'pk_end', 'width', 'side',
        'slope_pct', 'elevation',
        'optimal_elevation', 'L_entry', 'L_exit',
        'grade_entry_road', 'grade_exit_road',
        'volume_cut', 'volume_fill', 'balance',
    )

    def __init__(self, name, pk_start, pk_end, width,
                 side='right', slope_pct=PLATFORM_SLOPE_PCT,
                 elevation=None):
        if pk_end <= pk_start:
            raise ValueError(
                "[%s] pk_end (%s) debe ser mayor que pk_start (%s)"
                % (name, pk_end, pk_start)
            )
        if width <= 0:
            raise ValueError("[%s] ancho debe ser positivo" % name)
        if side not in ('right', 'left', 'both'):
            raise ValueError("[%s] side debe ser 'right', 'left' o 'both'" % name)

        self.name        = name
        self.pk_start    = float(pk_start)
        self.pk_end      = float(pk_end)
        self.width       = float(width)
        self.side        = side
        self.slope_pct   = float(slope_pct)
        self.elevation   = float(elevation) if elevation is not None else None

        self.optimal_elevation  = None
        self.L_entry            = 0.0
        self.L_exit             = 0.0
        self.grade_entry_road   = 0.0
        self.grade_exit_road    = 0.0
        self.volume_cut         = 0.0
        self.volume_fill        = 0.0
        self.balance            = 0.0

    @property
    def length(self):
        return self.pk_end - self.pk_start

    @property
    def active_elevation(self):
        return self.elevation if self.elevation is not None else self.optimal_elevation

    def __repr__(self):
        return (
            "Platform(%r, pk=%.1f-%.1f, L=%.1fm, w=%.1fm, side=%s)"
            % (self.name, self.pk_start, self.pk_end, self.length,
               self.width, self.side)
        )


# ===========================================================================
# 1. ACUERDOS VERTICALES
# ===========================================================================

def compute_kv_transition(grade_road_pct, grade_platform_pct,
                           kv=KV_DEFAULT):
    """
    L_acuerdo = KV × |Δi| / 100   (metros)

    KV : radio equivalente de la parábola vertical (m). Default 800 m.
    Δi : diferencia algebraica de pendientes en %.
    """
    delta_i = abs(grade_road_pct - grade_platform_pct)
    if delta_i < 1e-4:
        return 0.0
    return kv * delta_i / 100.0


def check_kv_feasibility(platform, kv=KV_DEFAULT):
    """
    Calcula longitudes de acuerdo de entrada y salida y emite avisos
    si resultan mayores de 200 m.
    Retorna dict: {'ok', 'L_entry', 'L_exit', 'warnings'}
    """
    warnings = []
    L_en = compute_kv_transition(platform.grade_entry_road, platform.slope_pct, kv)
    L_ex = compute_kv_transition(platform.grade_exit_road,  platform.slope_pct, kv)

    platform.L_entry = L_en
    platform.L_exit  = L_ex

    if L_en > 200:
        warnings.append(
            "%s: acuerdo entrada %.1fm — Δi=%.2f%% (reducir KV o "
            "aumentar pendiente de plataforma)" % (
                platform.name, L_en,
                abs(platform.grade_entry_road - platform.slope_pct))
        )
    if L_ex > 200:
        warnings.append(
            "%s: acuerdo salida %.1fm — Δi=%.2f%%" % (
                platform.name, L_ex,
                abs(platform.grade_exit_road - platform.slope_pct))
        )

    return {'ok': True, 'L_entry': L_en, 'L_exit': L_ex, 'warnings': warnings}


# ===========================================================================
# 2. UTILIDADES DE ALINEAMIENTO Y SUPERFICIE
# ===========================================================================

def _db():
    return Application.DocumentManager.MdiActiveDocument.Database


def get_road_grade_at(alignment_id, profile_id, station, delta=0.5):
    """
    Pendiente de la rasante en una estación (%).
    delta : semiintervalo para diferencia finita centrada (m).
    """
    db = _db()
    with db.TransactionManager.StartTransaction() as tr:
        prof = tr.GetObject(profile_id, OpenMode.ForRead)
        ali  = tr.GetObject(alignment_id, OpenMode.ForRead)
        s0   = max(ali.StartingStation, station - delta)
        s1   = min(ali.EndingStation,   station + delta)
        e0   = prof.ElevationAt(s0)
        e1   = prof.ElevationAt(s1)
        tr.Commit()
    ds = s1 - s0
    return 100.0 * (e1 - e0) / ds if ds > 1e-6 else 0.0


def _surface_elev_at_xy(surface_id, x, y):
    """Cota TIN en (x, y). Devuelve None si el punto cae fuera del TIN."""
    db = _db()
    with db.TransactionManager.StartTransaction() as tr:
        surf = tr.GetObject(surface_id, OpenMode.ForRead)
        try:
            z = surf.FindElevationAtXY(x, y)
            tr.Commit()
            return z
        except Exception:
            tr.Commit()
            return None


def _alignment_xy_at_station(alignment_id, station, offset=0.0):
    """
    Coordenadas (x, y) en el alineamiento a la estación y offset dados.
    offset > 0 → derecha;  offset < 0 → izquierda.
    """
    db = _db()
    with db.TransactionManager.StartTransaction() as tr:
        ali = tr.GetObject(alignment_id, OpenMode.ForRead)
        pt  = Point3d(0, 0, 0)
        dir = Vector3d(0, 0, 0)
        ali.PointLocation(station, offset, pt, dir)
        tr.Commit()
    return pt.X, pt.Y


def resolve_surface_id(surface_name):
    """Busca una superficie TIN por nombre (insensible a mayúsculas)."""
    cdoc = CivilApplication.ActiveDocument
    db   = _db()
    for sid in cdoc.GetSurfaceIds():
        with db.TransactionManager.StartTransaction() as tr:
            s = tr.GetObject(sid, OpenMode.ForRead)
            match = s.Name.upper() == surface_name.upper()
            tr.Commit()
            if match:
                return sid
    raise ValueError("Superficie '%s' no encontrada en el dibujo." % surface_name)


def resolve_profile_id(alignment_id, profile_name):
    """Busca un perfil de rasante por nombre dentro del alineamiento."""
    db = _db()
    with db.TransactionManager.StartTransaction() as tr:
        ali = tr.GetObject(alignment_id, OpenMode.ForRead)
        for pid in ali.GetProfileIds():
            prof = tr.GetObject(pid, OpenMode.ForRead)
            if prof.Name.upper() == profile_name.upper():
                tr.Commit()
                return pid
        tr.Commit()
    return None


def list_profile_names(alignment_id):
    """Lista los nombres de todos los perfiles de un alineamiento."""
    db    = _db()
    names = []
    with db.TransactionManager.StartTransaction() as tr:
        ali = tr.GetObject(alignment_id, OpenMode.ForRead)
        for pid in ali.GetProfileIds():
            prof = tr.GetObject(pid, OpenMode.ForRead)
            names.append(prof.Name)
        tr.Commit()
    return names


def resolve_assembly_id(assembly_name):
    """Busca un assembly por nombre (insensible a mayúsculas)."""
    from Autodesk.Civil.DatabaseServices import Assembly
    cdoc = CivilApplication.ActiveDocument
    db   = _db()
    for aid in cdoc.GetAssemblyIds():
        with db.TransactionManager.StartTransaction() as tr:
            asm = tr.GetObject(aid, OpenMode.ForRead)
            match = asm.Name.upper() == assembly_name.upper()
            tr.Commit()
            if match:
                return aid
    raise ValueError(
        "Assembly '%s' no encontrado. Ensamblajes disponibles: %s"
        % (assembly_name, _list_assembly_names())
    )


def _list_assembly_names():
    cdoc = CivilApplication.ActiveDocument
    db   = _db()
    names = []
    for aid in cdoc.GetAssemblyIds():
        with db.TransactionManager.StartTransaction() as tr:
            asm = tr.GetObject(aid, OpenMode.ForRead)
            names.append(asm.Name)
            tr.Commit()
    return names


def _ensure_layer(db, tr, layer_name):
    lt = tr.GetObject(db.LayerTableId, OpenMode.ForRead)
    if not lt.Has(layer_name):
        lt.UpgradeOpen()
        ltr       = LayerTableRecord()
        ltr.Name  = layer_name
        lt.Add(ltr)
        tr.AddNewlyCreatedDBObject(ltr, True)


# ===========================================================================
# 3. VOLÚMENES DE CORTE Y RELLENO
# ===========================================================================

def _cross_section_areas(surface_id, alignment_id, station,
                          platform_elev, width, side,
                          road_half_width=ROAD_HALF_WIDTH_M,
                          n_pts=12):
    """
    Áreas de corte y relleno en una sección transversal.
    Integración trapezoidal entre el TIN y la cota de plataforma.
    """
    def make_offsets(sign):
        return [sign * (road_half_width + width * k / n_pts)
                for k in range(n_pts + 1)]

    groups = []
    if side in ('right', 'both'):
        groups.append(make_offsets(+1))
    if side in ('left', 'both'):
        groups.append(make_offsets(-1))

    def integrate(offsets):
        zs = []
        for off in offsets:
            x, y = _alignment_xy_at_station(alignment_id, station, off)
            zs.append(_surface_elev_at_xy(surface_id, x, y))

        cut = fill = 0.0
        for i in range(len(offsets) - 1):
            o1, z1 = offsets[i], zs[i]
            o2, z2 = offsets[i + 1], zs[i + 1]
            if z1 is None or z2 is None:
                continue
            dw  = abs(o2 - o1)
            d1  = platform_elev - z1   # + relleno, - corte
            d2  = platform_elev - z2
            if d1 * d2 >= 0:
                avg = (d1 + d2) / 2.0
                if avg >= 0:
                    fill += dw * avg
                else:
                    cut  += dw * abs(avg)
            else:
                frac = abs(d1) / (abs(d1) + abs(d2))
                wA   = dw * frac
                wB   = dw * (1 - frac)
                if d1 < 0:
                    cut  += wA * abs(d1) / 2.0
                    fill += wB * abs(d2) / 2.0
                else:
                    fill += wA * d1 / 2.0
                    cut  += wB * abs(d2) / 2.0
        return cut, fill

    total_cut = total_fill = 0.0
    for g in groups:
        c, f = integrate(g)
        total_cut  += c
        total_fill += f
    return total_cut, total_fill


def compute_platform_earthwork(surface_id, alignment_id, platform,
                                road_half_width=ROAD_HALF_WIDTH_M,
                                spacing=SECTION_SPACING_M):
    """
    Volúmenes totales de corte y relleno (m³) por método de área media.
    Actualiza platform.volume_cut, .volume_fill y .balance.
    """
    elev = platform.active_elevation
    if elev is None:
        raise ValueError(
            "[%s] Sin cota de plataforma. Llamar find_optimal_elevation() primero."
            % platform.name
        )

    # Construir lista de estaciones equiespaciadas
    n_steps = max(2, int(math.ceil(platform.length / spacing)) + 1)
    stations = [
        platform.pk_start + platform.length * i / (n_steps - 1)
        for i in range(n_steps)
    ]

    vol_cut = vol_fill = 0.0
    prev_ac = prev_af = None

    for i, st in enumerate(stations):
        ds      = st - platform.pk_start
        z_plt   = elev + (platform.slope_pct / 100.0) * ds
        ac, af  = _cross_section_areas(
            surface_id, alignment_id, st, z_plt,
            platform.width, platform.side, road_half_width
        )
        if prev_ac is not None:
            d_st        = stations[i] - stations[i - 1]
            vol_cut    += (prev_ac + ac)  / 2.0 * d_st
            vol_fill   += (prev_af + af) / 2.0 * d_st
        prev_ac, prev_af = ac, af

    platform.volume_cut  = vol_cut
    platform.volume_fill = vol_fill
    platform.balance     = vol_cut - vol_fill
    return vol_cut, vol_fill


# ===========================================================================
# 4. COMPENSACIÓN DE TIERRAS (BISECCIÓN)
# ===========================================================================

def find_optimal_elevation(surface_id, alignment_id, platform,
                            road_half_width=ROAD_HALF_WIDTH_M,
                            spacing=SECTION_SPACING_M,
                            search_range=15.0):
    """
    Cota de inicio (pk_start) que equilibra corte y relleno.

    search_range : rango de búsqueda ± alrededor de la cota TN central (m).
    """
    cx, cy = _alignment_xy_at_station(
        alignment_id, (platform.pk_start + platform.pk_end) / 2.0
    )
    z_ref = _surface_elev_at_xy(surface_id, cx, cy)
    if z_ref is None:
        raise ValueError(
            "[%s] No se encontró cota TN en el centroide de la plataforma."
            % platform.name
        )

    z_low  = z_ref - search_range
    z_high = z_ref + search_range

    def balance(z):
        platform.elevation = z
        c, f = compute_platform_earthwork(
            surface_id, alignment_id, platform, road_half_width, spacing
        )
        return c - f   # > 0 → mucho corte → bajar z

    b_low  = balance(z_low)
    b_high = balance(z_high)

    # Sin cruce de signo: devolver el extremo de menor balance absoluto
    if b_low * b_high > 0:
        if abs(b_low) <= abs(b_high):
            platform.elevation = z_low
        else:
            platform.elevation = z_high
        platform.optimal_elevation = platform.elevation
        return platform.elevation

    # Bisección
    for _ in range(BISECT_MAX_ITER):
        z_mid   = (z_low + z_high) / 2.0
        b_mid   = balance(z_mid)
        if abs(b_mid) < BISECT_TOLERANCE * platform.length:
            break
        if b_low * b_mid <= 0:
            z_high = z_mid
            b_high = b_mid
        else:
            z_low  = z_mid
            b_low  = b_mid

    platform.elevation         = (z_low + z_high) / 2.0
    platform.optimal_elevation = platform.elevation
    return platform.elevation


# ===========================================================================
# 5. COMPENSACIÓN DE TODAS LAS PLATAFORMAS
# ===========================================================================

def compensate_earthwork_all(surface_id, alignment_id, platforms,
                              profile_id=None,
                              kv=KV_DEFAULT,
                              road_half_width=ROAD_HALF_WIDTH_M,
                              spacing=SECTION_SPACING_M,
                              search_range=15.0):
    """
    Para cada plataforma:
      1. Lee pendientes de rasante en pk_start y pk_end (si hay perfil).
      2. Calcula longitudes de acuerdo KV.
      3. Encuentra la cota óptima de compensación.
      4. Calcula volúmenes finales.

    Todos los parámetros de diseño son explícitos — ninguno hardcodeado.

    Retorna lista de dicts con resultados.
    """
    results = []

    for plt in platforms:
        res = {
            'name': plt.name, 'ok': True,
            'warnings': [], 'errors': [],
        }

        # A) Pendientes de rasante
        if profile_id is not None:
            try:
                plt.grade_entry_road = get_road_grade_at(
                    alignment_id, profile_id, plt.pk_start
                )
                plt.grade_exit_road  = get_road_grade_at(
                    alignment_id, profile_id, plt.pk_end
                )
            except Exception as ex:
                res['errors'].append("Error leyendo rasante: %s" % ex)
                res['ok'] = False
                results.append(res)
                continue
        else:
            res['warnings'].append(
                "Sin perfil de rasante — acuerdos calculados con pendiente 0%."
            )

        # B) Longitudes de acuerdo KV
        feas = check_kv_feasibility(plt, kv)
        res['L_entry']    = feas['L_entry']
        res['L_exit']     = feas['L_exit']
        res['warnings']  += feas['warnings']

        # C) Cota óptima
        if plt.elevation is None:
            try:
                find_optimal_elevation(
                    surface_id, alignment_id, plt,
                    road_half_width, spacing, search_range
                )
            except Exception as ex:
                res['errors'].append("Error en compensación: %s" % ex)
                res['ok'] = False
                results.append(res)
                continue
        else:
            compute_platform_earthwork(
                surface_id, alignment_id, plt, road_half_width, spacing
            )

        res['optimal_elevation'] = plt.active_elevation
        res['volume_cut']        = plt.volume_cut
        res['volume_fill']       = plt.volume_fill
        res['balance_m3']        = plt.balance
        results.append(res)

    return results


# ===========================================================================
# 6. MODIFICAR PERFIL DE RASANTE (PIPs)
# ===========================================================================

def add_platform_pips_to_profile(alignment_id, profile_id, platforms,
                                   kv=KV_DEFAULT):
    """
    Inserta PIPs con curvas verticales en el perfil de rasante para los
    acuerdos de entrada y salida de cada plataforma.

    Los PIPs se agregan siempre en orden de estación creciente.
    """
    doc  = Application.DocumentManager.MdiActiveDocument
    db   = doc.Database
    logs = []

    with doc.LockDocument():
        with db.TransactionManager.StartTransaction() as tr:
            prof  = tr.GetObject(profile_id, OpenMode.ForWrite)
            pvics = prof.PVIs

            for plt in platforms:
                elev_start = plt.active_elevation
                if elev_start is None:
                    logs.append("[%s] SKIP PIPs — sin cota calculada" % plt.name)
                    continue
                elev_end = (elev_start
                            + (plt.slope_pct / 100.0) * plt.length)

                for label, station, elev, L_cv in (
                    ("entrada", plt.pk_start, elev_start, plt.L_entry),
                    ("salida",  plt.pk_end,   elev_end,   plt.L_exit),
                ):
                    try:
                        pvi = pvics.AddPVI(station, elev)
                        pvi.CurveLength = L_cv
                        logs.append(
                            "[%s] PIP %s: PK=%.2f Z=%.3f L_cv=%.1fm"
                            % (plt.name, label, station, elev, L_cv)
                        )
                    except Exception as ex:
                        logs.append(
                            "[%s] ERROR PIP %s: %s" % (plt.name, label, ex)
                        )
            tr.Commit()

    return logs


# ===========================================================================
# 7. REGIONES DEL CORREDOR
# ===========================================================================

def add_platform_regions_to_corridor(corridor_id, alignment_id,
                                      platform_assembly_name, platforms):
    """
    Agrega una región del corredor por cada plataforma usando el assembly
    especificado.  El assembly debe existir en el dibujo — se busca por
    nombre (insensible a mayúsculas).
    """
    doc  = Application.DocumentManager.MdiActiveDocument
    db   = doc.Database
    logs = []

    try:
        plt_asm_id = resolve_assembly_id(platform_assembly_name)
    except ValueError as ex:
        return ["ERROR: %s" % ex]

    with doc.LockDocument():
        with db.TransactionManager.StartTransaction() as tr:
            corridor = tr.GetObject(corridor_id, OpenMode.ForWrite)
            baseline = corridor.Baselines[0]

            for plt in platforms:
                pk_reg_start = plt.pk_start - plt.L_entry / 2.0
                pk_reg_end   = plt.pk_end   + plt.L_exit  / 2.0
                try:
                    baseline.BaselineRegions.Add(
                        pk_reg_start, pk_reg_end, plt_asm_id
                    )
                    logs.append(
                        "[%s] Región corredor: PK=%.1f–%.1f"
                        % (plt.name, pk_reg_start, pk_reg_end)
                    )
                except Exception as ex:
                    logs.append(
                        "[%s] ERROR región corredor: %s" % (plt.name, ex)
                    )

            corridor.Rebuild()
            tr.Commit()

    return logs


# ===========================================================================
# 8. FEATURE LINES DE BORDE DE PLATAFORMA
# ===========================================================================

def create_platform_feature_lines(alignment_id, platforms,
                                   layer_name=LAYER_PLATFORM_FL,
                                   cross_slope_pct=CROSS_SLOPE_PCT,
                                   road_half_width=ROAD_HALF_WIDTH_M,
                                   spacing=SECTION_SPACING_M):
    """
    Feature Lines en los bordes exteriores de cada plataforma.
    Cota = Z_long (pendiente longitudinal) - Z_transv (bombeo de plataforma).

    Parámetros configurables:
      layer_name       : capa destino (creada si no existe)
      cross_slope_pct  : bombeo transversal de la plataforma (%)
      road_half_width  : semi-ancho de calzada (m)
      spacing          : espaciado entre puntos de la feature line (m)
    """
    doc  = Application.DocumentManager.MdiActiveDocument
    db   = doc.Database
    cdoc = CivilApplication.ActiveDocument
    logs = []

    with doc.LockDocument():
        with db.TransactionManager.StartTransaction() as tr:
            bt  = tr.GetObject(db.BlockTableId, OpenMode.ForRead)
            btr = tr.GetObject(bt[BlockTableRecord.ModelSpace], OpenMode.ForWrite)
            _ensure_layer(db, tr, layer_name)

            ali = tr.GetObject(alignment_id, OpenMode.ForRead)

            for plt in platforms:
                elev_start = plt.active_elevation
                if elev_start is None:
                    logs.append("[%s] SKIP feature lines — sin cota" % plt.name)
                    continue

                sides = []
                if plt.side in ('right', 'both'):
                    sides.append(('R', +plt.width))
                if plt.side in ('left', 'both'):
                    sides.append(('L', -plt.width))

                n_pts = max(2, int(math.ceil(plt.length / spacing)) + 1)
                stations = [
                    plt.pk_start + plt.length * i / (n_pts - 1)
                    for i in range(n_pts)
                ]

                for side_tag, sign in sides:
                    offset = sign * (road_half_width + plt.width) if sign > 0 else sign * (road_half_width + plt.width)
                    # offset al borde exterior de la plataforma
                    offset = (road_half_width + plt.width) * (1 if sign > 0 else -1)
                    pts3d  = []

                    for st in stations:
                        ds      = st - plt.pk_start
                        z_long  = elev_start + (plt.slope_pct / 100.0) * ds
                        z_trans = z_long - (cross_slope_pct / 100.0) * plt.width
                        pt  = Point3d(0, 0, 0)
                        dir = Vector3d(0, 0, 0)
                        ali.PointLocation(st, offset, pt, dir)
                        pts3d.append(Point3d(pt.X, pt.Y, z_trans))

                    if len(pts3d) >= 2:
                        try:
                            fl_id = FeatureLine.Create(
                                cdoc, ObjectId.Null,
                                "FL-%s-%s" % (plt.name, side_tag)
                            )
                            fl = tr.GetObject(fl_id, OpenMode.ForWrite)
                            fl.Layer = layer_name
                            for pt in pts3d:
                                fl.InsertPI(pt)
                            btr.AppendEntity(fl)
                            tr.AddNewlyCreatedDBObject(fl, True)
                            logs.append(
                                "[%s-%s] FeatureLine creada (%d pts)"
                                % (plt.name, side_tag, len(pts3d))
                            )
                        except Exception as ex:
                            logs.append(
                                "[%s-%s] ERROR feature line: %s"
                                % (plt.name, side_tag, ex)
                            )

            tr.Commit()

    return logs


# ===========================================================================
# 9. SUPERFICIE TIN DE PLATAFORMA
# ===========================================================================

def create_platform_tin_surface(alignment_id, platforms,
                                  surface_name_prefix="PLT",
                                  road_half_width=ROAD_HALF_WIDTH_M,
                                  cross_slope_pct=CROSS_SLOPE_PCT,
                                  spacing=SECTION_SPACING_M,
                                  n_lateral=6):
    """
    Superficie TIN de la explanada terminada para cada plataforma.

    Parámetros configurables:
      surface_name_prefix : prefijo para el nombre de la superficie
      road_half_width     : semi-ancho de calzada (m)
      cross_slope_pct     : bombeo transversal (%)
      spacing             : espaciado longitudinal de la malla (m)
      n_lateral           : divisiones transversales de la malla
    """
    doc  = Application.DocumentManager.MdiActiveDocument
    db   = doc.Database
    cdoc = CivilApplication.ActiveDocument
    logs = []

    for plt in platforms:
        elev_start = plt.active_elevation
        if elev_start is None:
            logs.append("[%s] SKIP TIN — sin cota" % plt.name)
            continue

        surf_name = "%s-%s" % (surface_name_prefix, plt.name)
        try:
            surf_id = TinSurface.Create(cdoc, surf_name)
        except Exception as ex:
            logs.append("[%s] ERROR crear TIN '%s': %s" % (plt.name, surf_name, ex))
            continue

        with doc.LockDocument():
            with db.TransactionManager.StartTransaction() as tr:
                surf = tr.GetObject(surf_id, OpenMode.ForWrite)
                ali  = tr.GetObject(alignment_id, OpenMode.ForRead)

                n_stations = max(4, int(math.ceil(plt.length / spacing)) + 1)

                offsets = []
                if plt.side in ('right', 'both'):
                    for k in range(n_lateral + 1):
                        offsets.append(road_half_width + plt.width * k / n_lateral)
                if plt.side in ('left', 'both'):
                    for k in range(n_lateral + 1):
                        offsets.append(-(road_half_width + plt.width * k / n_lateral))

                for i in range(n_stations):
                    st     = plt.pk_start + plt.length * i / (n_stations - 1)
                    ds     = st - plt.pk_start
                    z_long = elev_start + (plt.slope_pct / 100.0) * ds

                    for off in offsets:
                        dist_from_edge = abs(abs(off) - road_half_width)
                        z_cross = z_long - (cross_slope_pct / 100.0) * dist_from_edge
                        pt  = Point3d(0, 0, 0)
                        dir = Vector3d(0, 0, 0)
                        ali.PointLocation(st, off, pt, dir)
                        try:
                            surf.AddPoint(Point3d(pt.X, pt.Y, z_cross))
                        except Exception:
                            pass

                surf.Rebuild()
                tr.Commit()

        logs.append("[%s] TIN '%s' creado." % (plt.name, surf_name))

    return logs


# ===========================================================================
# 10. FUNCIÓN MAESTRA DE INTEGRACIÓN
# ===========================================================================

def integrate_platforms(alignment_id, profile_id, corridor_id, surface_id,
                         platforms,
                         platform_assembly_name="plataforma",
                         kv=KV_DEFAULT,
                         road_half_width=ROAD_HALF_WIDTH_M,
                         cross_slope_pct=CROSS_SLOPE_PCT,
                         section_spacing=SECTION_SPACING_M,
                         platform_layer=LAYER_PLATFORM_FL,
                         surface_prefix="PLT",
                         search_range=15.0):
    """
    Orquesta el flujo completo. Todos los parámetros son explícitos para
    que la función sea portátil a cualquier proyecto de Civil 3D.

    Pasos:
      1. Compensación de tierras (bisección → cota óptima)
      2. Acuerdos verticales KV
      3. PIPs en perfil de rasante
      4. Regiones de corredor con assembly de plataforma
      5. Feature lines de borde de explanada
      6. Superficie TIN de plataforma

    Retorna dict {'logs': [...], 'summary': [...]}
    """
    logs    = []
    summary = []

    # Pasos 1-2
    comp = compensate_earthwork_all(
        surface_id, alignment_id, platforms,
        profile_id=profile_id,
        kv=kv,
        road_half_width=road_half_width,
        spacing=section_spacing,
        search_range=search_range,
    )
    for r in comp:
        logs.append(
            "[%(name)s] Z=%(optimal_elevation).3f m  "
            "Corte=%(volume_cut).1f m³  Relleno=%(volume_fill).1f m³  "
            "Balance=%(balance_m3)+.1f m³  "
            "L_ent=%(L_entry).1f m  L_sal=%(L_exit).1f m" % r
        )
        logs += r.get('warnings', [])
        logs += r.get('errors',   [])
        summary.append(r)

    valid = [p for p, r in zip(platforms, comp) if r['ok']]

    # Paso 3
    logs += add_platform_pips_to_profile(alignment_id, profile_id, valid, kv)

    # Paso 4
    logs += add_platform_regions_to_corridor(
        corridor_id, alignment_id, platform_assembly_name, valid
    )

    # Paso 5
    logs += create_platform_feature_lines(
        alignment_id, valid,
        layer_name=platform_layer,
        cross_slope_pct=cross_slope_pct,
        road_half_width=road_half_width,
        spacing=section_spacing,
    )

    # Paso 6
    logs += create_platform_tin_surface(
        alignment_id, valid,
        surface_name_prefix=surface_prefix,
        road_half_width=road_half_width,
        cross_slope_pct=cross_slope_pct,
        spacing=section_spacing,
    )

    return {'logs': logs, 'summary': summary}
