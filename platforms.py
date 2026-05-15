# =============================================================================
# platforms.py  —  Plataformas con geometría real de taludes
#                  Civil 3D 2020-2026 | IronPython 2.7 (Dynamo)
#
# GEOMETRÍA COMPLETA DE LA SECCIÓN TRANSVERSAL:
#
#   CORTE (TN > plataforma):
#          TN
#         /|         ← corona de corte (intersección talud-TN)
#        / |
#       /  |  talud corte (1:1 por defecto → configurable)
#      /   |
#     ═════════════  ← plataforma (cota calculada)
#     road | width
#
#   RELLENO (TN < plataforma):
#     ═════════════  ← plataforma
#          \
#           \  talud relleno (1.5:1 por defecto → configurable)
#            \
#             \
#          TN  ← pie de relleno (intersección talud-TN)
#
# El código calcula:
#   1. Cota óptima de plataforma (bisección, corte = relleno)
#   2. Longitudes de acuerdo vertical KV en entrada y salida
#   3. Volúmenes REALES de corte y relleno (incluyen triángulos de talud)
#   4. Feature lines: borde de calzada, borde plataforma, corona/pie de talud
#   5. PIPs en rasante + regiones de corredor
# =============================================================================

from __future__ import print_function
import math
import clr

clr.AddReference('AcMgd')
clr.AddReference('AcDbMgd')
clr.AddReference('AeccDbMgd')

from Autodesk.AutoCAD.ApplicationServices import Application
from Autodesk.AutoCAD.DatabaseServices import (
    BlockTable, BlockTableRecord, OpenMode, ObjectId,
    LayerTable, LayerTableRecord,
)
from Autodesk.AutoCAD.Geometry import Point3d, Vector3d

from Autodesk.Civil.ApplicationServices import CivilApplication
from Autodesk.Civil.DatabaseServices import (
    Profile, TinSurface, FeatureLine,
)

# ---------------------------------------------------------------------------
# Defaults — todos sobreescribibles como argumentos
# ---------------------------------------------------------------------------
KV_DEFAULT          = 800.0   # Radio equiv. curva vertical (m)
PLATFORM_SLOPE_PCT  = 2.0     # Pendiente long. de drenaje (%)
CROSS_SLOPE_PCT     = 2.5     # Bombeo transversal plataforma (%)
CUT_SLOPE_HV        = 1.0     # Talud de corte  H:V  (1:1)
FILL_SLOPE_HV       = 1.5     # Talud de relleno H:V (1.5:1)
ROAD_HALF_WIDTH_M   = 4.0     # Semi-ancho de calzada (m)
SECTION_SPACING_M   = 5.0     # Espaciado secciones volumétricas (m)
TALUD_SEARCH_RANGE  = 60.0    # Búsqueda máxima de intersección talud-TN (m)
TALUD_STEP_M        = 0.25    # Paso de marcha para encontrar intersección (m)
BISECT_TOL          = 0.01    # Tolerancia compensación (m³/m)
BISECT_MAX_ITER     = 40
LAYER_BORDE         = "C-ROAD-PLATFORM-BORDE"    # Borde de plataforma
LAYER_TALUD         = "C-ROAD-PLATFORM-TALUD"    # Corona/pie de talud


# ===========================================================================
# CLASE PLATFORM
# ===========================================================================

class Platform(object):
    """
    Plataforma vial con geometría completa de taludes.

    Parámetros de entrada
    ---------------------
    name         : identificador  ej. "PLT-01"
    pk_start     : estación inicio (m)
    pk_end       : estación fin    (m)
    width        : ancho desde borde de calzada (m)
    side         : 'right' | 'left' | 'both'
    slope_pct    : pendiente longitudinal (%)   default 2%
    elevation    : cota forzada en pk_start (None = calcular óptima)
    cut_hv       : talud corte  H:V  ej. 1.0 para 1:1
    fill_hv      : talud relleno H:V ej. 1.5 para 1.5:1
    """

    def __init__(self, name, pk_start, pk_end, width, side='right',
                 slope_pct=PLATFORM_SLOPE_PCT, elevation=None,
                 cut_hv=CUT_SLOPE_HV, fill_hv=FILL_SLOPE_HV):
        if pk_end <= pk_start:
            raise ValueError("[%s] pk_end debe ser > pk_start" % name)
        if width <= 0:
            raise ValueError("[%s] ancho debe ser > 0" % name)
        if side not in ('right', 'left', 'both'):
            raise ValueError("[%s] side: 'right' | 'left' | 'both'" % name)

        self.name      = name
        self.pk_start  = float(pk_start)
        self.pk_end    = float(pk_end)
        self.width     = float(width)
        self.side      = side
        self.slope_pct = float(slope_pct)
        self.elevation = float(elevation) if elevation is not None else None
        self.cut_hv    = float(cut_hv)
        self.fill_hv   = float(fill_hv)

        # Calculados
        self.optimal_elevation = None
        self.L_entry           = 0.0
        self.L_exit            = 0.0
        self.grade_entry_road  = 0.0
        self.grade_exit_road   = 0.0
        self.volume_cut        = 0.0
        self.volume_fill       = 0.0
        self.balance           = 0.0

    @property
    def length(self):
        return self.pk_end - self.pk_start

    @property
    def active_elevation(self):
        return self.elevation if self.elevation is not None else self.optimal_elevation

    def z_at(self, station, cross_offset=0.0, cross_slope_pct=CROSS_SLOPE_PCT,
              road_half_width=ROAD_HALF_WIDTH_M):
        """
        Cota de la plataforma en una estación y offset dados.
        Combina la pendiente longitudinal y el bombeo transversal.
        cross_offset : distancia desde el borde de la calzada hacia afuera (m)
        """
        elev = self.active_elevation
        if elev is None:
            return None
        ds     = station - self.pk_start
        z_long = elev + (self.slope_pct / 100.0) * ds
        return z_long - (cross_slope_pct / 100.0) * cross_offset

    def __repr__(self):
        return ("Platform(%r, pk=%.1f-%.1f, L=%.1fm, w=%.1fm, "
                "side=%s, talud C%.1f:1/R%.1f:1)"
                % (self.name, self.pk_start, self.pk_end, self.length,
                   self.width, self.side, self.cut_hv, self.fill_hv))


# ===========================================================================
# 1. ACUERDOS VERTICALES KV
# ===========================================================================

def compute_kv_transition(grade_road_pct, grade_platform_pct, kv=KV_DEFAULT):
    """L = KV × |Δi| / 100  (m). KV = radio equiv. parábola vertical."""
    delta_i = abs(grade_road_pct - grade_platform_pct)
    return kv * delta_i / 100.0 if delta_i > 1e-4 else 0.0


def check_kv_feasibility(platform, kv=KV_DEFAULT):
    L_en = compute_kv_transition(platform.grade_entry_road, platform.slope_pct, kv)
    L_ex = compute_kv_transition(platform.grade_exit_road,  platform.slope_pct, kv)
    platform.L_entry = L_en
    platform.L_exit  = L_ex
    warnings = []
    for label, L in (("entrada", L_en), ("salida", L_ex)):
        if L > 200:
            warnings.append("[%s] Acuerdo %s = %.1fm — considerar reducir KV "
                            "o igualar pendiente de plataforma a la rasante"
                            % (platform.name, label, L))
    return {'ok': True, 'L_entry': L_en, 'L_exit': L_ex, 'warnings': warnings}


# ===========================================================================
# 2. UTILIDADES DE GEOMETRÍA
# ===========================================================================

def _db():
    return Application.DocumentManager.MdiActiveDocument.Database


def _acad_doc():
    return Application.DocumentManager.MdiActiveDocument


def get_road_grade_at(alignment_id, profile_id, station, delta=0.5):
    """Pendiente de la rasante en una estación (%) por diferencia finita."""
    db = _db()
    with db.TransactionManager.StartTransaction() as tr:
        prof = tr.GetObject(profile_id, OpenMode.ForRead)
        ali  = tr.GetObject(alignment_id, OpenMode.ForRead)
        s0   = max(ali.StartingStation, station - delta)
        s1   = min(ali.EndingStation,   station + delta)
        e0, e1 = prof.ElevationAt(s0), prof.ElevationAt(s1)
        tr.Commit()
    ds = s1 - s0
    return 100.0 * (e1 - e0) / ds if ds > 1e-6 else 0.0


def _tn_z(surface_id, x, y):
    """Cota TIN en (x, y). None si el punto cae fuera del TIN."""
    db = _db()
    with db.TransactionManager.StartTransaction() as tr:
        s = tr.GetObject(surface_id, OpenMode.ForRead)
        try:
            z = s.FindElevationAtXY(x, y)
            tr.Commit()
            return z
        except Exception:
            tr.Commit()
            return None


def _xy(alignment_id, station, offset=0.0):
    """(x, y) en el alineamiento a la estación y offset dados."""
    db = _db()
    with db.TransactionManager.StartTransaction() as tr:
        ali = tr.GetObject(alignment_id, OpenMode.ForRead)
        pt  = Point3d(0, 0, 0)
        d   = Vector3d(0, 0, 0)
        ali.PointLocation(station, offset, pt, d)
        tr.Commit()
    return pt.X, pt.Y


# ===========================================================================
# 3. GEOMETRÍA REAL DE SECCIÓN TRANSVERSAL (CON TALUDES)
# ===========================================================================

def _find_talud_intersection(surface_id, alignment_id, station,
                              edge_offset, z_plt_edge, is_cut,
                              cut_hv, fill_hv,
                              search_range=TALUD_SEARCH_RANGE,
                              step=TALUD_STEP_M):
    """
    Marcha desde el borde de la plataforma hacia afuera buscando dónde
    el plano del talud intersecta el TIN.

    Talud de CORTE (is_cut=True):
      z_talud = z_plt_edge + d * (1/cut_hv)   ← sube hacia afuera
      Intersecta TN cuando z_tn <= z_talud

    Talud de RELLENO (is_cut=False):
      z_talud = z_plt_edge - d * (1/fill_hv)  ← baja hacia afuera
      Intersecta TN cuando z_tn >= z_talud

    Retorna (offset_interseccion, z_interseccion) o (None, None).
    """
    sign = 1.0 if edge_offset >= 0 else -1.0
    slope_v_per_h = 1.0 / cut_hv if is_cut else 1.0 / fill_hv
    n_steps = int(search_range / step)

    prev_d = prev_diff = None

    for i in range(1, n_steps + 1):
        d  = i * step
        o  = edge_offset + sign * d
        x, y = _xy(alignment_id, station, o)
        z_tn = _tn_z(surface_id, x, y)
        if z_tn is None:
            break

        if is_cut:
            z_talud = z_plt_edge + d * slope_v_per_h
            diff    = z_tn - z_talud   # > 0 TN aún sobre talud, < 0 intersectó
        else:
            z_talud = z_plt_edge - d * slope_v_per_h
            diff    = z_talud - z_tn   # > 0 talud aún sobre TN, < 0 intersectó

        if diff <= 0:
            # Interpolar entre paso anterior y este para mayor precisión
            if prev_d is not None and prev_diff is not None and (prev_diff - diff) > 1e-9:
                frac = prev_diff / (prev_diff - diff)
                d_int = prev_d + frac * step
                o_int = edge_offset + sign * d_int
                x_int, y_int = _xy(alignment_id, station, o_int)
                z_int = _tn_z(surface_id, x_int, y_int)
                if z_int is not None:
                    return o_int, z_int
            return o, z_tn

        prev_d, prev_diff = d, diff

    return None, None   # sin intersección en el rango de búsqueda


def cross_section_geometry(surface_id, alignment_id, station, platform,
                            road_half_width=ROAD_HALF_WIDTH_M,
                            cross_slope_pct=CROSS_SLOPE_PCT,
                            n_pts=16):
    """
    Geometría completa de la sección transversal en una estación.

    Retorna dict con:
      'area_cut'          : área de corte (m²) — plataforma + talud
      'area_fill'         : área de relleno (m²)
      'talud_points_cut'  : list[(offset, z)] puntos de corona de corte
      'talud_points_fill' : list[(offset, z)] puntos de pie de relleno
      'platform_points'   : list[(offset, z_plt, z_tn)] dentro del ancho de plataforma
    """
    elev = platform.active_elevation
    if elev is None:
        return {'area_cut': 0.0, 'area_fill': 0.0,
                'talud_points_cut': [], 'talud_points_fill': [],
                'platform_points': []}

    def process_side(sign):
        """sign = +1 derecha, -1 izquierda."""
        area_cut = area_fill = 0.0
        plt_pts  = []
        t_cut    = []
        t_fill   = []

        # ── A. Zona de plataforma (road_hw → road_hw + width) ──────────────
        offsets = [sign * (road_half_width + platform.width * k / n_pts)
                   for k in range(n_pts + 1)]
        prev_ac = prev_af = None
        prev_off = None

        for off in offsets:
            dist_from_road = abs(abs(off) - road_half_width)
            z_plt = platform.z_at(station, dist_from_road, cross_slope_pct, road_half_width)
            x, y  = _xy(alignment_id, station, off)
            z_tn  = _tn_z(surface_id, x, y)
            plt_pts.append((off, z_plt, z_tn))

            if z_tn is None:
                prev_ac = prev_af = None
                prev_off = off
                continue

            dz = z_plt - z_tn   # + relleno,  - corte
            cur_c = max(0.0, -dz)
            cur_f = max(0.0,  dz)

            if prev_ac is not None and prev_off is not None:
                dw = abs(off - prev_off)
                area_cut  += (prev_ac + cur_c) / 2.0 * dw
                area_fill += (prev_af + cur_f) / 2.0 * dw

            prev_ac, prev_af, prev_off = cur_c, cur_f, off

        # ── B. Talud más allá del borde exterior de plataforma ─────────────
        edge_off  = sign * (road_half_width + platform.width)
        dist_edge = platform.width   # distancia desde eje de calzada al borde
        z_plt_edge = platform.z_at(station, dist_edge, cross_slope_pct, road_half_width)
        x_e, y_e   = _xy(alignment_id, station, edge_off)
        z_tn_edge  = _tn_z(surface_id, x_e, y_e)

        if z_tn_edge is not None:
            is_cut = z_tn_edge > z_plt_edge

            o_int, z_int = _find_talud_intersection(
                surface_id, alignment_id, station,
                edge_off, z_plt_edge, is_cut,
                platform.cut_hv, platform.fill_hv
            )

            if o_int is not None:
                # Área del triángulo de talud (base horizontal × altura / 2)
                base_h  = abs(o_int - edge_off)
                height  = abs(z_tn_edge - z_plt_edge)
                tri_area = 0.5 * base_h * height

                if is_cut:
                    area_cut += tri_area
                    t_cut.append((o_int, z_int))
                else:
                    area_fill += tri_area
                    t_fill.append((o_int, z_int))

        return area_cut, area_fill, plt_pts, t_cut, t_fill

    total_cut = total_fill = 0.0
    all_plt   = []
    all_t_cut = []
    all_t_fill= []

    if platform.side in ('right', 'both'):
        c, f, pp, tc, tf = process_side(+1)
        total_cut  += c;  total_fill += f
        all_plt    += pp; all_t_cut  += tc; all_t_fill += tf
    if platform.side in ('left', 'both'):
        c, f, pp, tc, tf = process_side(-1)
        total_cut  += c;  total_fill += f
        all_plt    += pp; all_t_cut  += tc; all_t_fill += tf

    return {
        'area_cut':          total_cut,
        'area_fill':         total_fill,
        'talud_points_cut':  all_t_cut,
        'talud_points_fill': all_t_fill,
        'platform_points':   all_plt,
    }


# ===========================================================================
# 4. VOLÚMENES (ÁREA MEDIA CON GEOMETRÍA REAL)
# ===========================================================================

def compute_platform_earthwork(surface_id, alignment_id, platform,
                                road_half_width=ROAD_HALF_WIDTH_M,
                                cross_slope_pct=CROSS_SLOPE_PCT,
                                spacing=SECTION_SPACING_M):
    """
    Volúmenes de corte y relleno (m³) por método de área media.
    Usa la geometría real de sección incluyendo taludes.
    Actualiza platform.volume_cut, .volume_fill y .balance.
    """
    if platform.active_elevation is None:
        raise ValueError("[%s] Sin cota de plataforma." % platform.name)

    n = max(2, int(math.ceil(platform.length / spacing)) + 1)
    stations = [platform.pk_start + platform.length * i / (n - 1)
                for i in range(n)]

    vol_cut = vol_fill = 0.0
    prev_c  = prev_f  = None

    for i, st in enumerate(stations):
        geo = cross_section_geometry(
            surface_id, alignment_id, st, platform,
            road_half_width, cross_slope_pct
        )
        ac, af = geo['area_cut'], geo['area_fill']

        if prev_c is not None:
            ds = stations[i] - stations[i - 1]
            vol_cut  += (prev_c + ac) / 2.0 * ds
            vol_fill += (prev_f + af) / 2.0 * ds

        prev_c, prev_f = ac, af

    platform.volume_cut  = vol_cut
    platform.volume_fill = vol_fill
    platform.balance     = vol_cut - vol_fill
    return vol_cut, vol_fill


# ===========================================================================
# 5. COMPENSACIÓN DE TIERRAS (BISECCIÓN)
# ===========================================================================

def find_optimal_elevation(surface_id, alignment_id, platform,
                            road_half_width=ROAD_HALF_WIDTH_M,
                            cross_slope_pct=CROSS_SLOPE_PCT,
                            spacing=SECTION_SPACING_M,
                            search_range=15.0):
    """
    Cota en pk_start que equilibra corte y relleno.
    Método de bisección sobre la función balance(z) = corte(z) - relleno(z).
    """
    cx, cy = _xy(alignment_id, (platform.pk_start + platform.pk_end) / 2.0)
    z_ref  = _tn_z(surface_id, cx, cy)
    if z_ref is None:
        raise ValueError("[%s] No se encontró cota TN en el centroide."
                         % platform.name)

    z_low  = z_ref - search_range
    z_high = z_ref + search_range

    def balance(z):
        platform.elevation = z
        c, f = compute_platform_earthwork(
            surface_id, alignment_id, platform,
            road_half_width, cross_slope_pct, spacing
        )
        return c - f

    b_low  = balance(z_low)
    b_high = balance(z_high)

    if b_low * b_high > 0:
        platform.elevation = z_low if abs(b_low) <= abs(b_high) else z_high
        platform.optimal_elevation = platform.elevation
        return platform.elevation

    for _ in range(BISECT_MAX_ITER):
        z_mid = (z_low + z_high) / 2.0
        b_mid = balance(z_mid)
        if abs(b_mid) < BISECT_TOL * platform.length:
            break
        if b_low * b_mid <= 0:
            z_high, b_high = z_mid, b_mid
        else:
            z_low,  b_low  = z_mid, b_mid

    platform.elevation         = (z_low + z_high) / 2.0
    platform.optimal_elevation = platform.elevation
    return platform.elevation


# ===========================================================================
# 6. COMPENSACIÓN DE TODAS LAS PLATAFORMAS
# ===========================================================================

def compensate_earthwork_all(surface_id, alignment_id, platforms,
                              profile_id=None,
                              kv=KV_DEFAULT,
                              road_half_width=ROAD_HALF_WIDTH_M,
                              cross_slope_pct=CROSS_SLOPE_PCT,
                              spacing=SECTION_SPACING_M,
                              search_range=15.0):
    results = []
    for plt in platforms:
        res = {'name': plt.name, 'ok': True, 'warnings': [], 'errors': []}

        if profile_id is not None:
            try:
                plt.grade_entry_road = get_road_grade_at(alignment_id, profile_id, plt.pk_start)
                plt.grade_exit_road  = get_road_grade_at(alignment_id, profile_id, plt.pk_end)
            except Exception as ex:
                res['errors'].append("Rasante: %s" % ex)
                res['ok'] = False; results.append(res); continue
        else:
            res['warnings'].append("Sin perfil — acuerdos con pendiente 0%.")

        feas = check_kv_feasibility(plt, kv)
        res['L_entry']   = feas['L_entry']
        res['L_exit']    = feas['L_exit']
        res['warnings'] += feas['warnings']

        if plt.elevation is None:
            try:
                find_optimal_elevation(surface_id, alignment_id, plt,
                                       road_half_width, cross_slope_pct,
                                       spacing, search_range)
            except Exception as ex:
                res['errors'].append("Compensación: %s" % ex)
                res['ok'] = False; results.append(res); continue
        else:
            compute_platform_earthwork(surface_id, alignment_id, plt,
                                       road_half_width, cross_slope_pct, spacing)

        res['optimal_elevation'] = plt.active_elevation
        res['volume_cut']        = plt.volume_cut
        res['volume_fill']       = plt.volume_fill
        res['balance_m3']        = plt.balance
        results.append(res)
    return results


# ===========================================================================
# 7. PIPs EN PERFIL DE RASANTE
# ===========================================================================

def add_platform_pips_to_profile(alignment_id, profile_id, platforms,
                                   kv=KV_DEFAULT):
    doc  = _acad_doc()
    db   = doc.Database
    logs = []
    with doc.LockDocument():
        with db.TransactionManager.StartTransaction() as tr:
            prof  = tr.GetObject(profile_id, OpenMode.ForWrite)
            pvics = prof.PVIs
            for plt in platforms:
                elev_s = plt.active_elevation
                if elev_s is None:
                    logs.append("[%s] SKIP PIPs — sin cota" % plt.name); continue
                elev_e = elev_s + (plt.slope_pct / 100.0) * plt.length
                for label, st, elev, Lcv in (
                    ("entrada", plt.pk_start, elev_s, plt.L_entry),
                    ("salida",  plt.pk_end,   elev_e, plt.L_exit),
                ):
                    try:
                        pvi = pvics.AddPVI(st, elev)
                        pvi.CurveLength = Lcv
                        logs.append("[%s] PIP %s PK=%.2f Z=%.3f Lcv=%.1fm"
                                    % (plt.name, label, st, elev, Lcv))
                    except Exception as ex:
                        logs.append("[%s] ERROR PIP %s: %s" % (plt.name, label, ex))
            tr.Commit()
    return logs


# ===========================================================================
# 8. REGIONES DE CORREDOR
# ===========================================================================

def add_platform_regions_to_corridor(corridor_id, alignment_id,
                                      platform_assembly_name, platforms):
    doc  = _acad_doc()
    db   = doc.Database
    logs = []
    try:
        asm_id = resolve_assembly_id(platform_assembly_name)
    except ValueError as ex:
        return ["ERROR: %s" % ex]

    with doc.LockDocument():
        with db.TransactionManager.StartTransaction() as tr:
            cor = tr.GetObject(corridor_id, OpenMode.ForWrite)
            bl  = cor.Baselines[0]
            for plt in platforms:
                pk0 = plt.pk_start - plt.L_entry / 2.0
                pk1 = plt.pk_end   + plt.L_exit  / 2.0
                try:
                    bl.BaselineRegions.Add(pk0, pk1, asm_id)
                    logs.append("[%s] Región corredor PK=%.1f–%.1f" % (plt.name, pk0, pk1))
                except Exception as ex:
                    logs.append("[%s] ERROR región: %s" % (plt.name, ex))
            cor.Rebuild()
            tr.Commit()
    return logs


# ===========================================================================
# 9. FEATURE LINES (BORDE + CORONA/PIE DE TALUD)
# ===========================================================================

def create_platform_feature_lines(surface_id, alignment_id, platforms,
                                   road_half_width=ROAD_HALF_WIDTH_M,
                                   cross_slope_pct=CROSS_SLOPE_PCT,
                                   layer_borde=LAYER_BORDE,
                                   layer_talud=LAYER_TALUD,
                                   spacing=SECTION_SPACING_M):
    """
    Crea 2 juegos de Feature Lines por plataforma y por lado:

    1. BORDE de plataforma  (road_half_width + width desde el eje)
       → cota = z_plt con pendiente long. y bombeo transversal

    2. CORONA / PIE DE TALUD  (intersección real talud-TN)
       → cota real del TIN en el punto de intersección

    Las feature lines se pueden usar directamente como líneas de ruptura
    para la superficie de grading de la plataforma.
    """
    doc  = _acad_doc()
    db   = doc.Database
    cdoc = CivilApplication.ActiveDocument
    logs = []

    with doc.LockDocument():
        with db.TransactionManager.StartTransaction() as tr:
            bt  = tr.GetObject(db.BlockTableId, OpenMode.ForRead)
            btr = tr.GetObject(bt[BlockTableRecord.ModelSpace], OpenMode.ForWrite)
            _ensure_layer(db, tr, layer_borde)
            _ensure_layer(db, tr, layer_talud)
            ali = tr.GetObject(alignment_id, OpenMode.ForRead)

            for plt in platforms:
                if plt.active_elevation is None:
                    logs.append("[%s] SKIP FL — sin cota" % plt.name); continue

                n   = max(2, int(math.ceil(plt.length / spacing)) + 1)
                sts = [plt.pk_start + plt.length * i / (n - 1) for i in range(n)]

                sides = []
                if plt.side in ('right', 'both'): sides.append(+1)
                if plt.side in ('left',  'both'): sides.append(-1)

                for sign in sides:
                    tag        = 'R' if sign > 0 else 'L'
                    edge_off   = sign * (road_half_width + plt.width)
                    pts_borde  = []
                    pts_talud  = []

                    for st in sts:
                        # ── Feature line 1: borde de plataforma ────────────
                        dist_from_road = plt.width
                        z_borde = plt.z_at(st, dist_from_road, cross_slope_pct, road_half_width)
                        pt  = Point3d(0, 0, 0)
                        dv  = Vector3d(0, 0, 0)
                        ali.PointLocation(st, edge_off, pt, dv)
                        pts_borde.append(Point3d(pt.X, pt.Y, z_borde))

                        # ── Feature line 2: corona/pie de talud ────────────
                        x_e, y_e   = _xy(alignment_id, st, edge_off)
                        z_tn_edge  = _tn_z(surface_id, x_e, y_e)
                        if z_tn_edge is not None:
                            is_cut = z_tn_edge > z_borde
                            o_int, z_int = _find_talud_intersection(
                                surface_id, alignment_id, st,
                                edge_off, z_borde, is_cut,
                                plt.cut_hv, plt.fill_hv
                            )
                            if o_int is not None and z_int is not None:
                                xp, yp = _xy(alignment_id, st, o_int)
                                pts_talud.append(Point3d(xp, yp, z_int))

                    # Crear feature line de borde
                    if len(pts_borde) >= 2:
                        _make_feature_line(
                            cdoc, tr, btr, db,
                            "FL-%s-%s-BORDE" % (plt.name, tag),
                            layer_borde, pts_borde
                        )
                        logs.append("[%s-%s] FL BORDE (%d pts)" % (plt.name, tag, len(pts_borde)))

                    # Crear feature line de talud
                    if len(pts_talud) >= 2:
                        _make_feature_line(
                            cdoc, tr, btr, db,
                            "FL-%s-%s-TALUD" % (plt.name, tag),
                            layer_talud, pts_talud
                        )
                        logs.append("[%s-%s] FL TALUD (%d pts)" % (plt.name, tag, len(pts_talud)))

            tr.Commit()
    return logs


def _make_feature_line(cdoc, tr, btr, db, name, layer, pts3d):
    fl_id = FeatureLine.Create(cdoc, ObjectId.Null, name)
    fl    = tr.GetObject(fl_id, OpenMode.ForWrite)
    fl.Layer = layer
    for pt in pts3d:
        fl.InsertPI(pt)
    btr.AppendEntity(fl)
    tr.AddNewlyCreatedDBObject(fl, True)


# ===========================================================================
# 10. SUPERFICIE TIN DE PLATAFORMA
# ===========================================================================

def create_platform_tin_surface(alignment_id, platforms,
                                  surface_name_prefix="PLT",
                                  road_half_width=ROAD_HALF_WIDTH_M,
                                  cross_slope_pct=CROSS_SLOPE_PCT,
                                  spacing=SECTION_SPACING_M,
                                  n_lateral=8):
    doc  = _acad_doc()
    db   = doc.Database
    cdoc = CivilApplication.ActiveDocument
    logs = []

    for plt in platforms:
        if plt.active_elevation is None:
            logs.append("[%s] SKIP TIN — sin cota" % plt.name); continue

        surf_name = "%s-%s" % (surface_name_prefix, plt.name)
        try:
            surf_id = TinSurface.Create(cdoc, surf_name)
        except Exception as ex:
            logs.append("[%s] ERROR TIN: %s" % (plt.name, ex)); continue

        with doc.LockDocument():
            with db.TransactionManager.StartTransaction() as tr:
                surf = tr.GetObject(surf_id, OpenMode.ForWrite)
                ali  = tr.GetObject(alignment_id, OpenMode.ForRead)

                n_st   = max(4, int(math.ceil(plt.length / spacing)) + 1)
                signs  = []
                if plt.side in ('right', 'both'): signs.append(+1)
                if plt.side in ('left',  'both'): signs.append(-1)

                for i in range(n_st):
                    st  = plt.pk_start + plt.length * i / (n_st - 1)
                    for sign in signs:
                        for k in range(n_lateral + 1):
                            dist = plt.width * k / n_lateral
                            off  = sign * (road_half_width + dist)
                            z_p  = plt.z_at(st, dist, cross_slope_pct, road_half_width)
                            pt   = Point3d(0, 0, 0)
                            dv   = Vector3d(0, 0, 0)
                            ali.PointLocation(st, off, pt, dv)
                            try:
                                surf.AddPoint(Point3d(pt.X, pt.Y, z_p))
                            except Exception:
                                pass

                surf.Rebuild()
                tr.Commit()

        logs.append("[%s] TIN '%s' creado." % (plt.name, surf_name))
    return logs


# ===========================================================================
# 11. RESOLUCIÓN DE OBJETOS POR NOMBRE (PORTABILIDAD)
# ===========================================================================

def resolve_surface_id(surface_name):
    cdoc = CivilApplication.ActiveDocument
    db   = _db()
    for sid in cdoc.GetSurfaceIds():
        with db.TransactionManager.StartTransaction() as tr:
            s   = tr.GetObject(sid, OpenMode.ForRead)
            hit = s.Name.upper() == surface_name.upper()
            tr.Commit()
            if hit: return sid
    raise ValueError("Superficie '%s' no encontrada." % surface_name)


def resolve_profile_id(alignment_id, profile_name):
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
    db    = _db()
    names = []
    with db.TransactionManager.StartTransaction() as tr:
        ali = tr.GetObject(alignment_id, OpenMode.ForRead)
        for pid in ali.GetProfileIds():
            names.append(tr.GetObject(pid, OpenMode.ForRead).Name)
        tr.Commit()
    return names


def resolve_assembly_id(assembly_name):
    cdoc = CivilApplication.ActiveDocument
    db   = _db()
    avail = []
    for aid in cdoc.GetAssemblyIds():
        with db.TransactionManager.StartTransaction() as tr:
            asm = tr.GetObject(aid, OpenMode.ForRead)
            n   = asm.Name
            tr.Commit()
            if n.upper() == assembly_name.upper(): return aid
            avail.append(n)
    raise ValueError("Assembly '%s' no encontrado. Disponibles: %s"
                     % (assembly_name, avail))


def _ensure_layer(db, tr, name):
    lt = tr.GetObject(db.LayerTableId, OpenMode.ForRead)
    if not lt.Has(name):
        lt.UpgradeOpen()
        ltr      = LayerTableRecord()
        ltr.Name = name
        lt.Add(ltr)
        tr.AddNewlyCreatedDBObject(ltr, True)


# ===========================================================================
# 12. FUNCIÓN MAESTRA
# ===========================================================================

def integrate_platforms(alignment_id, profile_id, corridor_id, surface_id,
                         platforms,
                         platform_assembly_name="plataforma",
                         kv=KV_DEFAULT,
                         road_half_width=ROAD_HALF_WIDTH_M,
                         cross_slope_pct=CROSS_SLOPE_PCT,
                         section_spacing=SECTION_SPACING_M,
                         layer_borde=LAYER_BORDE,
                         layer_talud=LAYER_TALUD,
                         surface_prefix="PLT",
                         search_range=15.0):
    logs = []; summary = []

    comp = compensate_earthwork_all(
        surface_id, alignment_id, platforms,
        profile_id=profile_id, kv=kv,
        road_half_width=road_half_width,
        cross_slope_pct=cross_slope_pct,
        spacing=section_spacing, search_range=search_range,
    )
    for r in comp:
        logs.append(
            "[%(name)s] Z=%(optimal_elevation).3f m  "
            "Corte=%(volume_cut).1f m3  Relleno=%(volume_fill).1f m3  "
            "Balance=%(balance_m3)+.1f m3  "
            "L_ent=%(L_entry).1f m  L_sal=%(L_exit).1f m" % r
        )
        logs += r.get('warnings', []) + r.get('errors', [])
        summary.append(r)

    valid = [p for p, r in zip(platforms, comp) if r['ok']]

    logs += add_platform_pips_to_profile(alignment_id, profile_id, valid, kv)
    logs += add_platform_regions_to_corridor(
        corridor_id, alignment_id, platform_assembly_name, valid
    )
    logs += create_platform_feature_lines(
        surface_id, alignment_id, valid,
        road_half_width=road_half_width,
        cross_slope_pct=cross_slope_pct,
        layer_borde=layer_borde, layer_talud=layer_talud,
        spacing=section_spacing,
    )
    logs += create_platform_tin_surface(
        alignment_id, valid,
        surface_name_prefix=surface_prefix,
        road_half_width=road_half_width,
        cross_slope_pct=cross_slope_pct,
        spacing=section_spacing,
    )
    return {'logs': logs, 'summary': summary}
