# =============================================================================
# platforms.py  —  Plataformas con geometría EXACTA de taludes
#                  Civil 3D 2020-2026 | IronPython 2.7 (Dynamo)
#
# MODELO DE SECCIÓN TRANSVERSAL
# ══════════════════════════════
#
#  La cota de la plataforma en cada estación se ancla al PERFIL DE RASANTE:
#
#    z_borde_calzada(s) = perfil_rasante(s) - cross_slope_road * road_hw
#    z_plt(s, d)        = z_borde_calzada(s) - cross_slope_plt * d
#                         (d = distancia desde borde de calzada, m)
#
#  Esto asegura que la plataforma siempre toca la calzada en el borde, sin
#  saltos de cota.  Si se fuerza una elevación manual, se aplica como offset
#  vertical constante sobre toda la plataforma.
#
#  CORTE (TN > plataforma):
#
#           corona de corte
#          ╱│
#         ╱ │  h_c = TN - z_talud
#        ╱  │
#  ──────   │← borde plataforma
#       ←d→ (horizontal)
#
#  z_talud_corte(d) = z_borde_plt + d · (1/cut_hv)    [sube hacia afuera]
#  Intersecta TN cuando TN ≤ z_talud
#
#  RELLENO (TN < plataforma):
#
#  ──────│← borde plataforma
#        │╲
#        │ ╲  h_f = z_talud - TN
#        │  ╲
#           pie de relleno
#
#  z_talud_relleno(d) = z_borde_plt - d · (1/fill_hv)  [baja hacia afuera]
#  Intersecta TN cuando TN ≥ z_talud
#
#  ÁREA REAL (integración trapezoidal dentro de la zona talud):
#
#    A_talud = Σ  [ (h_i + h_{i+1}) / 2 · Δd ]
#              i
#
#  donde h_i = |z_tn(d_i) - z_talud(d_i)|  en cada punto de muestra.
#  Esto es exacto para terreno arbitrario, NO la aproximación triangular.
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
from Autodesk.Civil.DatabaseServices import TinSurface, FeatureLine

# ── Defaults (todos sobreescribibles) ────────────────────────────────────────
KV_DEFAULT          = 800.0    # Radio equiv. curva vertical (m)
PLATFORM_SLOPE_PCT  = 2.0      # Pendiente long. plataforma (%)
CROSS_SLOPE_PLT_PCT = 2.5      # Bombeo plataforma (%)
CROSS_SLOPE_ROAD_PCT= 2.5      # Bombeo calzada (%)
CUT_SLOPE_HV        = 1.0      # Talud corte   H:V
FILL_SLOPE_HV       = 1.5      # Talud relleno H:V
ROAD_HALF_WIDTH_M   = 4.0      # Semi-ancho calzada (m)
SECTION_SPACING_M   = 5.0      # Espaciado secciones vol. (m)
TALUD_SEARCH_RANGE  = 60.0     # Búsqueda máx. intersección talud-TN (m)
TALUD_STEP_M        = 0.25     # Paso de marcha para intersección (m)
TALUD_SAMPLE_PTS    = 20       # Puntos de integración dentro del talud
BISECT_TOL          = 0.01     # Tolerancia compensación (m³/m)
BISECT_MAX_ITER     = 40
LAYER_BORDE         = "C-ROAD-PLATFORM-BORDE"
LAYER_TALUD         = "C-ROAD-PLATFORM-TALUD"


# ============================================================================
# CLASE PLATFORM
# ============================================================================

class Platform(object):
    """
    Plataforma vial lateral.

    La cota de referencia (elevation_offset) es un desplazamiento vertical
    aplicado SOBRE la cota del borde de calzada del perfil de rasante.
    Si es None, se calcula automáticamente para equilibrar corte y relleno.

    Parámetros
    ----------
    name            : str
    pk_start        : float (m)
    pk_end          : float (m)
    width           : float — ancho desde borde de calzada (m)
    side            : 'right' | 'left' | 'both'
    slope_pct       : float — pendiente long. propia (% sobre pk_start→pk_end)
    elevation_offset: float | None — offset sobre borde calzada (m).
                      0.0 = plataforma al mismo nivel que borde calzada.
                      None = calcular para balance.
    cut_hv          : float — talud corte H:V (1.0 → 1:1)
    fill_hv         : float — talud relleno H:V (1.5 → 1.5:1)
    """

    def __init__(self, name, pk_start, pk_end, width, side='right',
                 slope_pct=PLATFORM_SLOPE_PCT, elevation_offset=None,
                 cut_hv=CUT_SLOPE_HV, fill_hv=FILL_SLOPE_HV):
        if pk_end <= pk_start:
            raise ValueError("[%s] pk_end > pk_start requerido" % name)
        if width <= 0:
            raise ValueError("[%s] width > 0 requerido" % name)
        if side not in ('right', 'left', 'both'):
            raise ValueError("[%s] side: 'right'|'left'|'both'" % name)

        self.name             = name
        self.pk_start         = float(pk_start)
        self.pk_end           = float(pk_end)
        self.width            = float(width)
        self.side             = side
        self.slope_pct        = float(slope_pct)
        self.elevation_offset = float(elevation_offset) if elevation_offset is not None else None
        self.cut_hv           = float(cut_hv)
        self.fill_hv          = float(fill_hv)

        # Calculados
        self.optimal_offset   = None   # offset óptimo encontrado por bisección
        self.L_entry          = 0.0
        self.L_exit           = 0.0
        self.grade_entry_road = 0.0
        self.grade_exit_road  = 0.0
        self.volume_cut       = 0.0
        self.volume_fill      = 0.0
        self.balance          = 0.0

    @property
    def length(self):
        return self.pk_end - self.pk_start

    @property
    def active_offset(self):
        if self.elevation_offset is not None:
            return self.elevation_offset
        return self.optimal_offset if self.optimal_offset is not None else 0.0

    def z_edge(self, profile_id, station,
               road_half_width=ROAD_HALF_WIDTH_M,
               cross_slope_road_pct=CROSS_SLOPE_ROAD_PCT):
        """
        Cota del borde de calzada en esta estación, tomada del perfil de
        rasante más el bombeo de la calzada.  Este es el punto de arranque
        de la plataforma.
        """
        z_cl = _profile_elev(profile_id, station)
        sign = 1.0 if self.side == 'right' else -1.0
        z_be = z_cl - (cross_slope_road_pct / 100.0) * road_half_width * sign
        return z_be

    def z_at(self, profile_id, station, dist_from_road_edge,
             road_half_width=ROAD_HALF_WIDTH_M,
             cross_slope_road_pct=CROSS_SLOPE_ROAD_PCT,
             cross_slope_plt_pct=CROSS_SLOPE_PLT_PCT):
        """
        Cota de la plataforma en la estación y a la distancia `dist_from_road_edge`
        desde el borde de calzada (metros, siempre positivo).

        z = z_borde_calzada(s)
            + active_offset
            + (s - pk_start) * slope_pct/100   [pendiente long. propia]
            - dist_from_road_edge * cross_slope_plt_pct/100
        """
        z_be  = self.z_edge(profile_id, station, road_half_width, cross_slope_road_pct)
        ds    = station - self.pk_start
        z_plt = (z_be
                 + self.active_offset
                 + (self.slope_pct / 100.0) * ds
                 - (cross_slope_plt_pct / 100.0) * dist_from_road_edge)
        return z_plt

    def __repr__(self):
        return ("Platform(%r pk=%.0f–%.0f w=%.1f %s C%.1f:1/R%.1f:1)"
                % (self.name, self.pk_start, self.pk_end,
                   self.width, self.side, self.cut_hv, self.fill_hv))


# ============================================================================
# ACCESO A OBJETOS Civil 3D / AutoCAD
# ============================================================================

def _db():
    return Application.DocumentManager.MdiActiveDocument.Database

def _acad_doc():
    return Application.DocumentManager.MdiActiveDocument

def _profile_elev(profile_id, station):
    """Cota del perfil de rasante en una estación."""
    db = _db()
    with db.TransactionManager.StartTransaction() as tr:
        prof = tr.GetObject(profile_id, OpenMode.ForRead)
        z    = prof.ElevationAt(station)
        tr.Commit()
    return z

def _tn_z(surface_id, x, y):
    """Cota TIN en (x,y). None si fuera del TIN."""
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
    """(x,y) en el alineamiento a la estación y offset."""
    db = _db()
    with db.TransactionManager.StartTransaction() as tr:
        ali = tr.GetObject(alignment_id, OpenMode.ForRead)
        pt  = Point3d(0, 0, 0)
        d   = Vector3d(0, 0, 0)
        ali.PointLocation(station, offset, pt, d)
        tr.Commit()
    return pt.X, pt.Y

def get_road_grade_at(alignment_id, profile_id, station, delta=1.0):
    """Pendiente de la rasante en estación (%) por diferencia finita."""
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


# ============================================================================
# ACUERDOS VERTICALES KV
# ============================================================================

def compute_kv_transition(grade_road_pct, grade_platform_pct, kv=KV_DEFAULT):
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
            warnings.append("[%s] Acuerdo %s = %.1fm — reducir KV o igualar pendientes"
                            % (platform.name, label, L))
    return {'ok': True, 'L_entry': L_en, 'L_exit': L_ex, 'warnings': warnings}


# ============================================================================
# BÚSQUEDA DE INTERSECCIÓN TALUD–TIN
# ============================================================================

def _find_talud_intersection(surface_id, alignment_id, station,
                              edge_offset, z_plt_edge, is_cut,
                              cut_hv, fill_hv,
                              search_range=TALUD_SEARCH_RANGE,
                              step=TALUD_STEP_M):
    """
    Marcha desde el borde de la plataforma buscando la intersección del plano
    del talud con el TIN.

    CORTE:  z_talud(d) = z_plt_edge + d / cut_hv   [sube hacia afuera]
            Intersecta cuando z_tn ≤ z_talud

    RELLENO: z_talud(d) = z_plt_edge - d / fill_hv  [baja hacia afuera]
             Intersecta cuando z_tn ≥ z_talud

    Retorna (offset_interseccion, z_interseccion, d_interseccion)
    o (None, None, None) si no se encontró.
    """
    sign      = 1.0 if edge_offset >= 0 else -1.0
    hv        = cut_hv if is_cut else fill_hv
    n_steps   = int(search_range / step)
    prev_d = prev_diff = None

    for i in range(1, n_steps + 1):
        d    = i * step
        o    = edge_offset + sign * d
        x, y = _xy(alignment_id, station, o)
        z_tn = _tn_z(surface_id, x, y)
        if z_tn is None:
            break

        z_talud = (z_plt_edge + d / hv) if is_cut else (z_plt_edge - d / hv)

        if is_cut:
            diff = z_tn - z_talud   # > 0: TN aún sobre talud
        else:
            diff = z_talud - z_tn   # > 0: talud aún sobre TN

        if diff <= 0.0:
            if prev_d is not None and prev_diff is not None and (prev_diff - diff) > 1e-9:
                frac  = prev_diff / (prev_diff - diff)
                d_int = prev_d + frac * step
                o_int = edge_offset + sign * d_int
                xi, yi = _xy(alignment_id, station, o_int)
                z_int  = _tn_z(surface_id, xi, yi)
                if z_int is not None:
                    return o_int, z_int, d_int
            return o, z_tn, d

        prev_d, prev_diff = d, diff

    return None, None, None


# ============================================================================
# ÁREA DEL TALUD  (integración trapezoidal, NO triángulo)
# ============================================================================

def _talud_area(surface_id, alignment_id, station,
                edge_offset, z_plt_edge, is_cut,
                cut_hv, fill_hv, d_intersection,
                n_pts=TALUD_SAMPLE_PTS):
    """
    Área REAL entre el plano del talud y el TIN, desde el borde de la
    plataforma hasta la intersección, usando integración trapezoidal.

    No es un triángulo — el terreno puede ser convexo, cóncavo o irregular.

        A = Σ (h_i + h_{i+1})/2 · Δd
             i
    donde h_i = |z_tn(d_i) - z_talud(d_i)|
    """
    if d_intersection is None or d_intersection <= 0:
        return 0.0

    sign = 1.0 if edge_offset >= 0 else -1.0
    hv   = cut_hv if is_cut else fill_hv
    area = 0.0
    h_prev = None
    d_prev = 0.0

    for i in range(n_pts + 1):
        d    = d_intersection * i / n_pts
        o    = edge_offset + sign * d
        x, y = _xy(alignment_id, station, o)
        z_tn = _tn_z(surface_id, x, y)
        if z_tn is None:
            h_prev = None
            continue

        z_talud = (z_plt_edge + d / hv) if is_cut else (z_plt_edge - d / hv)
        h_cur   = max(0.0, (z_tn - z_talud) if is_cut else (z_talud - z_tn))

        if h_prev is not None:
            area += (h_prev + h_cur) / 2.0 * (d - d_prev)

        h_prev = h_cur
        d_prev = d

    return area


# ============================================================================
# GEOMETRÍA COMPLETA DE SECCIÓN TRANSVERSAL
# ============================================================================

def cross_section_geometry(surface_id, alignment_id, profile_id,
                            station, platform,
                            road_half_width=ROAD_HALF_WIDTH_M,
                            cross_slope_road_pct=CROSS_SLOPE_ROAD_PCT,
                            cross_slope_plt_pct=CROSS_SLOPE_PLT_PCT,
                            n_pts_plt=16):
    """
    Calcula las áreas de corte y relleno en una sección transversal,
    incluyendo la zona de plataforma y la zona de talud.

    Retorna dict:
      area_cut          : m² de corte total (plataforma + talud)
      area_fill         : m² de relleno total
      talud_pt_cut      : [(offset, z)] corona de corte por lado
      talud_pt_fill     : [(offset, z)] pie de relleno por lado
    """
    def process_side(sign):
        area_cut = area_fill = 0.0
        t_cut = []; t_fill = []

        # ── A. Zona de plataforma ─────────────────────────────────────────
        #    Integración trapezoidal de d=0..width (d desde borde calzada)
        offsets = [sign * (road_half_width + platform.width * k / n_pts_plt)
                   for k in range(n_pts_plt + 1)]
        prev_c = prev_f = prev_o = None

        for off in offsets:
            dist = abs(abs(off) - road_half_width)
            z_plt = platform.z_at(profile_id, station, dist,
                                   road_half_width, cross_slope_road_pct,
                                   cross_slope_plt_pct)
            x, y  = _xy(alignment_id, station, off)
            z_tn  = _tn_z(surface_id, x, y)
            if z_tn is None:
                prev_c = prev_f = prev_o = None
                continue

            dz  = z_plt - z_tn
            c_i = max(0.0, -dz)
            f_i = max(0.0,  dz)

            if prev_c is not None:
                dw        = abs(off - prev_o)
                area_cut  += (prev_c + c_i) / 2.0 * dw
                area_fill += (prev_f + f_i) / 2.0 * dw

            prev_c, prev_f, prev_o = c_i, f_i, off

        # ── B. Zona de talud ──────────────────────────────────────────────
        #    Integración trapezoidal desde borde plataforma hasta TN
        edge_off    = sign * (road_half_width + platform.width)
        z_plt_edge  = platform.z_at(profile_id, station, platform.width,
                                     road_half_width, cross_slope_road_pct,
                                     cross_slope_plt_pct)
        xe, ye      = _xy(alignment_id, station, edge_off)
        z_tn_edge   = _tn_z(surface_id, xe, ye)

        if z_tn_edge is not None:
            is_cut = z_tn_edge > z_plt_edge

            o_int, z_int, d_int = _find_talud_intersection(
                surface_id, alignment_id, station,
                edge_off, z_plt_edge, is_cut,
                platform.cut_hv, platform.fill_hv
            )

            if d_int is not None:
                a_talud = _talud_area(
                    surface_id, alignment_id, station,
                    edge_off, z_plt_edge, is_cut,
                    platform.cut_hv, platform.fill_hv, d_int
                )
                if is_cut:
                    area_cut += a_talud
                    t_cut.append((o_int, z_int))
                else:
                    area_fill += a_talud
                    t_fill.append((o_int, z_int))

        return area_cut, area_fill, t_cut, t_fill

    tot_cut = tot_fill = 0.0
    all_tc = []; all_tf = []

    if platform.side in ('right', 'both'):
        c, f, tc, tf = process_side(+1)
        tot_cut += c; tot_fill += f; all_tc += tc; all_tf += tf
    if platform.side in ('left', 'both'):
        c, f, tc, tf = process_side(-1)
        tot_cut += c; tot_fill += f; all_tc += tc; all_tf += tf

    return {'area_cut':      tot_cut,
            'area_fill':     tot_fill,
            'talud_pt_cut':  all_tc,
            'talud_pt_fill': all_tf}


# ============================================================================
# MUESTREO DE SECCIÓN PARA VISUALIZACIÓN / DEPURACIÓN
# ============================================================================

def sample_cross_section(surface_id, alignment_id, profile_id,
                          station, platform,
                          road_half_width=ROAD_HALF_WIDTH_M,
                          cross_slope_road_pct=CROSS_SLOPE_ROAD_PCT,
                          cross_slope_plt_pct=CROSS_SLOPE_PLT_PCT,
                          n_pts_plt=20, n_pts_talud=20):
    """
    Retorna puntos [(offset, z_plataforma, z_tn)] para plotear la sección.
    Útil para verificar visualmente la geometría.
    """
    result = []

    def sample_side(sign):
        pts = []
        # Zona de plataforma
        for k in range(n_pts_plt + 1):
            off  = sign * (road_half_width + platform.width * k / n_pts_plt)
            dist = abs(abs(off) - road_half_width)
            z_pl = platform.z_at(profile_id, station, dist,
                                  road_half_width, cross_slope_road_pct,
                                  cross_slope_plt_pct)
            x, y = _xy(alignment_id, station, off)
            z_tn = _tn_z(surface_id, x, y)
            pts.append((off, z_pl, z_tn))

        # Zona de talud
        edge_off   = sign * (road_half_width + platform.width)
        z_plt_edge = platform.z_at(profile_id, station, platform.width,
                                    road_half_width, cross_slope_road_pct,
                                    cross_slope_plt_pct)
        xe, ye     = _xy(alignment_id, station, edge_off)
        z_tn_edge  = _tn_z(surface_id, xe, ye)
        if z_tn_edge is None:
            return pts

        is_cut = z_tn_edge > z_plt_edge
        o_int, z_int, d_int = _find_talud_intersection(
            surface_id, alignment_id, station,
            edge_off, z_plt_edge, is_cut,
            platform.cut_hv, platform.fill_hv
        )
        if d_int is None:
            return pts

        hv = platform.cut_hv if is_cut else platform.fill_hv
        for k in range(n_pts_talud + 1):
            d    = d_int * k / n_pts_talud
            off  = edge_off + sign * d
            z_tl = (z_plt_edge + d / hv) if is_cut else (z_plt_edge - d / hv)
            x, y = _xy(alignment_id, station, off)
            z_tn = _tn_z(surface_id, x, y)
            pts.append((off, z_tl, z_tn))
        return pts

    if platform.side in ('right', 'both'):
        result += sample_side(+1)
    if platform.side in ('left', 'both'):
        result += sample_side(-1)
    return result


# ============================================================================
# VOLÚMENES  (método de área media)
# ============================================================================

def compute_platform_earthwork(surface_id, alignment_id, profile_id,
                                platform,
                                road_half_width=ROAD_HALF_WIDTH_M,
                                cross_slope_road_pct=CROSS_SLOPE_ROAD_PCT,
                                cross_slope_plt_pct=CROSS_SLOPE_PLT_PCT,
                                spacing=SECTION_SPACING_M):
    """
    Volúmenes de corte y relleno (m³).  Método de área media con secciones
    a cada `spacing` metros.  Usa geometría exacta incluyendo taludes.
    """
    n  = max(2, int(math.ceil(platform.length / spacing)) + 1)
    sts = [platform.pk_start + platform.length * i / (n - 1) for i in range(n)]

    vol_cut = vol_fill = 0.0
    prev_c  = prev_f  = None

    for i, st in enumerate(sts):
        geo = cross_section_geometry(
            surface_id, alignment_id, profile_id, st, platform,
            road_half_width, cross_slope_road_pct, cross_slope_plt_pct
        )
        ac, af = geo['area_cut'], geo['area_fill']
        if prev_c is not None:
            ds        = sts[i] - sts[i - 1]
            vol_cut  += (prev_c + ac) / 2.0 * ds
            vol_fill += (prev_f + af) / 2.0 * ds
        prev_c, prev_f = ac, af

    platform.volume_cut  = vol_cut
    platform.volume_fill = vol_fill
    platform.balance     = vol_cut - vol_fill
    return vol_cut, vol_fill


# ============================================================================
# COMPENSACIÓN DE TIERRAS (BISECCIÓN SOBRE elevation_offset)
# ============================================================================

def find_optimal_offset(surface_id, alignment_id, profile_id, platform,
                         road_half_width=ROAD_HALF_WIDTH_M,
                         cross_slope_road_pct=CROSS_SLOPE_ROAD_PCT,
                         cross_slope_plt_pct=CROSS_SLOPE_PLT_PCT,
                         spacing=SECTION_SPACING_M,
                         search_range=5.0):
    """
    Busca el elevation_offset (Δz sobre el borde de calzada) que equilibra
    corte y relleno.  Bisección en [-search_range, +search_range] metros.
    """
    def balance(offset):
        platform.elevation_offset = offset
        c, f = compute_platform_earthwork(
            surface_id, alignment_id, profile_id, platform,
            road_half_width, cross_slope_road_pct, cross_slope_plt_pct, spacing
        )
        return c - f

    z_low  = -search_range
    z_high = +search_range
    b_low  = balance(z_low)
    b_high = balance(z_high)

    if b_low * b_high > 0:
        best = z_low if abs(b_low) <= abs(b_high) else z_high
        platform.elevation_offset = best
        platform.optimal_offset   = best
        return best

    for _ in range(BISECT_MAX_ITER):
        z_mid = (z_low + z_high) / 2.0
        b_mid = balance(z_mid)
        if abs(b_mid) < BISECT_TOL * platform.length:
            break
        if b_low * b_mid <= 0:
            z_high, b_high = z_mid, b_mid
        else:
            z_low,  b_low  = z_mid, b_mid

    opt = (z_low + z_high) / 2.0
    platform.elevation_offset = opt
    platform.optimal_offset   = opt
    return opt


# ============================================================================
# COMPENSAR TODAS LAS PLATAFORMAS
# ============================================================================

def compensate_earthwork_all(surface_id, alignment_id, profile_id, platforms,
                              kv=KV_DEFAULT,
                              road_half_width=ROAD_HALF_WIDTH_M,
                              cross_slope_road_pct=CROSS_SLOPE_ROAD_PCT,
                              cross_slope_plt_pct=CROSS_SLOPE_PLT_PCT,
                              spacing=SECTION_SPACING_M,
                              search_range=5.0):
    results = []
    for plt in platforms:
        res = {'name': plt.name, 'ok': True, 'warnings': [], 'errors': []}
        try:
            plt.grade_entry_road = get_road_grade_at(alignment_id, profile_id, plt.pk_start)
            plt.grade_exit_road  = get_road_grade_at(alignment_id, profile_id, plt.pk_end)
        except Exception as ex:
            res['errors'].append("Rasante: %s" % ex)
            res['ok'] = False; results.append(res); continue

        feas = check_kv_feasibility(plt, kv)
        res['L_entry']   = feas['L_entry']
        res['L_exit']    = feas['L_exit']
        res['warnings'] += feas['warnings']

        if plt.elevation_offset is None:
            try:
                find_optimal_offset(surface_id, alignment_id, profile_id, plt,
                                    road_half_width, cross_slope_road_pct,
                                    cross_slope_plt_pct, spacing, search_range)
            except Exception as ex:
                res['errors'].append("Compensación: %s" % ex)
                res['ok'] = False; results.append(res); continue
        else:
            compute_platform_earthwork(
                surface_id, alignment_id, profile_id, plt,
                road_half_width, cross_slope_road_pct,
                cross_slope_plt_pct, spacing
            )

        res['elevation_offset'] = plt.active_offset
        res['volume_cut']       = plt.volume_cut
        res['volume_fill']      = plt.volume_fill
        res['balance_m3']       = plt.balance
        res['optimal_elevation'] = plt.active_offset   # alias para log
        results.append(res)
    return results


# ============================================================================
# PIPs EN PERFIL DE RASANTE
# ============================================================================

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
                z_start = _profile_elev(profile_id, plt.pk_start) + plt.active_offset
                z_end   = _profile_elev(profile_id, plt.pk_end)   + plt.active_offset \
                          + (plt.slope_pct / 100.0) * plt.length
                for label, st, elev, Lcv in (
                    ("entrada", plt.pk_start, z_start, plt.L_entry),
                    ("salida",  plt.pk_end,   z_end,   plt.L_exit),
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


# ============================================================================
# REGIONES DE CORREDOR
# ============================================================================

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
                    logs.append("[%s] Región PK=%.1f–%.1f" % (plt.name, pk0, pk1))
                except Exception as ex:
                    logs.append("[%s] ERROR región: %s" % (plt.name, ex))
            cor.Rebuild()
            tr.Commit()
    return logs


# ============================================================================
# FEATURE LINES  (borde de plataforma + corona/pie de talud)
# ============================================================================

def create_platform_feature_lines(surface_id, alignment_id, profile_id,
                                   platforms,
                                   road_half_width=ROAD_HALF_WIDTH_M,
                                   cross_slope_road_pct=CROSS_SLOPE_ROAD_PCT,
                                   cross_slope_plt_pct=CROSS_SLOPE_PLT_PCT,
                                   layer_borde=LAYER_BORDE,
                                   layer_talud=LAYER_TALUD,
                                   spacing=SECTION_SPACING_M):
    """
    Por plataforma y por lado, crea:
      FL-*-R-BORDE  : borde de la explanada (arranca en borde calzada + width)
      FL-*-R-TALUD  : corona de corte o pie de relleno (intersección talud-TN)
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
                n   = max(2, int(math.ceil(plt.length / spacing)) + 1)
                sts = [plt.pk_start + plt.length * i / (n - 1) for i in range(n)]

                sides = []
                if plt.side in ('right', 'both'): sides.append(+1)
                if plt.side in ('left',  'both'): sides.append(-1)

                for sign in sides:
                    tag       = 'R' if sign > 0 else 'L'
                    edge_off  = sign * (road_half_width + plt.width)
                    pts_borde = []
                    pts_talud = []

                    for st in sts:
                        # Borde de plataforma
                        z_b = plt.z_at(profile_id, st, plt.width,
                                        road_half_width, cross_slope_road_pct,
                                        cross_slope_plt_pct)
                        pt  = Point3d(0, 0, 0); dv = Vector3d(0, 0, 0)
                        ali.PointLocation(st, edge_off, pt, dv)
                        pts_borde.append(Point3d(pt.X, pt.Y, z_b))

                        # Intersección talud-TN
                        xe, ye    = _xy(alignment_id, st, edge_off)
                        z_tn_edge = _tn_z(surface_id, xe, ye)
                        if z_tn_edge is None:
                            continue
                        is_cut = z_tn_edge > z_b
                        o_int, z_int, _ = _find_talud_intersection(
                            surface_id, alignment_id, st,
                            edge_off, z_b, is_cut,
                            plt.cut_hv, plt.fill_hv
                        )
                        if o_int is not None:
                            xi, yi = _xy(alignment_id, st, o_int)
                            pts_talud.append(Point3d(xi, yi, z_int))

                    if len(pts_borde) >= 2:
                        _make_feature_line(cdoc, tr, btr, db,
                                           "FL-%s-%s-BORDE" % (plt.name, tag),
                                           layer_borde, pts_borde)
                        logs.append("[%s-%s] FL-BORDE (%d pts)" % (plt.name, tag, len(pts_borde)))

                    if len(pts_talud) >= 2:
                        _make_feature_line(cdoc, tr, btr, db,
                                           "FL-%s-%s-TALUD" % (plt.name, tag),
                                           layer_talud, pts_talud)
                        logs.append("[%s-%s] FL-TALUD (%d pts)" % (plt.name, tag, len(pts_talud)))

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


# ============================================================================
# SUPERFICIE TIN DE PLATAFORMA
# ============================================================================

def create_platform_tin_surface(alignment_id, profile_id, platforms,
                                  surface_name_prefix="PLT",
                                  road_half_width=ROAD_HALF_WIDTH_M,
                                  cross_slope_road_pct=CROSS_SLOPE_ROAD_PCT,
                                  cross_slope_plt_pct=CROSS_SLOPE_PLT_PCT,
                                  spacing=SECTION_SPACING_M,
                                  n_lateral=10):
    doc  = _acad_doc()
    db   = doc.Database
    cdoc = CivilApplication.ActiveDocument
    logs = []

    for plt in platforms:
        surf_name = "%s-%s" % (surface_name_prefix, plt.name)
        try:
            surf_id = TinSurface.Create(cdoc, surf_name)
        except Exception as ex:
            logs.append("[%s] ERROR TIN: %s" % (plt.name, ex)); continue

        with doc.LockDocument():
            with db.TransactionManager.StartTransaction() as tr:
                surf = tr.GetObject(surf_id, OpenMode.ForWrite)
                ali  = tr.GetObject(alignment_id, OpenMode.ForRead)
                n_st = max(4, int(math.ceil(plt.length / spacing)) + 1)
                signs = []
                if plt.side in ('right', 'both'): signs.append(+1)
                if plt.side in ('left',  'both'): signs.append(-1)

                for i in range(n_st):
                    st = plt.pk_start + plt.length * i / (n_st - 1)
                    for sign in signs:
                        for k in range(n_lateral + 1):
                            dist = plt.width * k / n_lateral
                            off  = sign * (road_half_width + dist)
                            z_p  = plt.z_at(profile_id, st, dist,
                                             road_half_width,
                                             cross_slope_road_pct,
                                             cross_slope_plt_pct)
                            pt   = Point3d(0, 0, 0); dv = Vector3d(0, 0, 0)
                            ali.PointLocation(st, off, pt, dv)
                            try:
                                surf.AddPoint(Point3d(pt.X, pt.Y, z_p))
                            except Exception:
                                pass
                surf.Rebuild()
                tr.Commit()
        logs.append("[%s] TIN '%s' OK." % (plt.name, surf_name))
    return logs


# ============================================================================
# RESOLUCIÓN DE OBJETOS POR NOMBRE
# ============================================================================

def resolve_surface_id(surface_name):
    cdoc = CivilApplication.ActiveDocument; db = _db()
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
    db = _db(); names = []
    with db.TransactionManager.StartTransaction() as tr:
        ali = tr.GetObject(alignment_id, OpenMode.ForRead)
        for pid in ali.GetProfileIds():
            names.append(tr.GetObject(pid, OpenMode.ForRead).Name)
        tr.Commit()
    return names

def resolve_assembly_id(assembly_name):
    cdoc = CivilApplication.ActiveDocument; db = _db(); avail = []
    for aid in cdoc.GetAssemblyIds():
        with db.TransactionManager.StartTransaction() as tr:
            asm = tr.GetObject(aid, OpenMode.ForRead)
            n   = asm.Name; tr.Commit()
            if n.upper() == assembly_name.upper(): return aid
            avail.append(n)
    raise ValueError("Assembly '%s' no encontrado. Disponibles: %s"
                     % (assembly_name, avail))

def _ensure_layer(db, tr, name):
    lt = tr.GetObject(db.LayerTableId, OpenMode.ForRead)
    if not lt.Has(name):
        lt.UpgradeOpen()
        ltr = LayerTableRecord(); ltr.Name = name
        lt.Add(ltr); tr.AddNewlyCreatedDBObject(ltr, True)


# ============================================================================
# FUNCIÓN MAESTRA
# ============================================================================

def integrate_platforms(alignment_id, profile_id, corridor_id, surface_id,
                         platforms,
                         platform_assembly_name="plataforma",
                         kv=KV_DEFAULT,
                         road_half_width=ROAD_HALF_WIDTH_M,
                         cross_slope_road_pct=CROSS_SLOPE_ROAD_PCT,
                         cross_slope_plt_pct=CROSS_SLOPE_PLT_PCT,
                         section_spacing=SECTION_SPACING_M,
                         layer_borde=LAYER_BORDE,
                         layer_talud=LAYER_TALUD,
                         surface_prefix="PLT",
                         search_range=5.0):
    logs = []; summary = []

    comp = compensate_earthwork_all(
        surface_id, alignment_id, profile_id, platforms,
        kv=kv, road_half_width=road_half_width,
        cross_slope_road_pct=cross_slope_road_pct,
        cross_slope_plt_pct=cross_slope_plt_pct,
        spacing=section_spacing, search_range=search_range,
    )
    for r in comp:
        logs.append(
            "[%(name)s] Δz=%(elevation_offset)+.3fm  "
            "Corte=%(volume_cut).1f m³  Relleno=%(volume_fill).1f m³  "
            "Balance=%(balance_m3)+.1f m³  "
            "L_ent=%(L_entry).1f m  L_sal=%(L_exit).1f m" % r
        )
        for w in r.get('warnings', []): logs.append("  AVISO: " + w)
        for e in r.get('errors',   []): logs.append("  ERROR: " + e)
        summary.append(r)

    valid = [p for p, r in zip(platforms, comp) if r['ok']]

    logs += add_platform_pips_to_profile(alignment_id, profile_id, valid, kv)
    logs += add_platform_regions_to_corridor(
        corridor_id, alignment_id, platform_assembly_name, valid
    )
    logs += create_platform_feature_lines(
        surface_id, alignment_id, profile_id, valid,
        road_half_width=road_half_width,
        cross_slope_road_pct=cross_slope_road_pct,
        cross_slope_plt_pct=cross_slope_plt_pct,
        layer_borde=layer_borde, layer_talud=layer_talud,
        spacing=section_spacing,
    )
    logs += create_platform_tin_surface(
        alignment_id, profile_id, valid,
        surface_name_prefix=surface_prefix,
        road_half_width=road_half_width,
        cross_slope_road_pct=cross_slope_road_pct,
        cross_slope_plt_pct=cross_slope_plt_pct,
        spacing=section_spacing,
    )
    return {'logs': logs, 'summary': summary}
