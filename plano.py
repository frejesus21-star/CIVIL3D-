# =============================================================================
# plano.py  —  Generación de plano final de plataformas
#              Civil 3D 2020-2026 | IronPython 2.7 (Dynamo)
#
#  Genera en el espacio modelo y/o en una presentación (layout):
#
#  1. TABLA DE VOLÚMENES (AutoCAD TABLE)
#     Plataforma | PK inicio | PK fin | L (m) | Corte (m³) | Relleno (m³)
#     | Balance (m³) | Δz (m)
#
#  2. ACHURADO EN PLANTA
#     · Rojo / ANSI31 → zona de CORTE (entre FL-BORDE y FL-TALUD)
#     · Verde / ANSI37 → zona de RELLENO
#
#  3. ETIQUETAS DE PLATAFORMA
#     Texto multilínea en el centroide de cada plataforma con los datos clave.
#
#  4. SECCIONES TRANSVERSALES ESQUEMÁTICAS
#     Dibujo 2D de la sección en entrada, centro y salida de cada plataforma,
#     colocadas en una cuadrícula en el espacio modelo.
#
#  5. LAYOUT DE PRESENTACIÓN (opcional)
#     Crea un nuevo Layout "PLATAFORMAS" con viewports de planta y tabla.
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
    Table, TableStyle, CellType,
    Hatch, HatchLoopTypes, HatchStyle,
    Polyline, Polyline2d, Vertex2d,
    MText, AttachmentPoint,
    Line, DBText, TextHorizontalMode, TextVerticalMode,
    Viewport, Layout, LayoutManager,
)
from Autodesk.AutoCAD.Geometry import Point2d, Point3d, Vector3d
from Autodesk.AutoCAD.Colors import Color, ColorMethod

from Autodesk.Civil.ApplicationServices import CivilApplication

# Importar módulo propio
import sys, os
for _p in [os.path.dirname(os.path.abspath(__file__))
           if '__file__' in dir() else '',
           r'C:\Civil3D', r'C:\Users\Public\Civil3D']:
    if _p and _p not in sys.path:
        sys.path.insert(0, _p)

from platforms import (_db, _acad_doc, _xy, _tn_z, _profile_elev,
                        _ensure_layer, _find_talud_intersection,
                        LAYER_BORDE, LAYER_TALUD,
                        ROAD_HALF_WIDTH_M, CROSS_SLOPE_PLT_PCT,
                        CROSS_SLOPE_ROAD_PCT, SECTION_SPACING_M,
                        TALUD_STEP_M)

# ── Capas del plano ───────────────────────────────────────────────────────────
LAYER_HATCH_CUT    = "C-ROAD-PLT-HATCH-CORTE"
LAYER_HATCH_FILL   = "C-ROAD-PLT-HATCH-RELLENO"
LAYER_LABEL        = "C-ROAD-PLT-LABEL"
LAYER_SECTION      = "C-ROAD-PLT-SECTION"
LAYER_TABLE        = "C-ROAD-PLT-TABLE"

# Colores AutoCAD
COLOR_CUT  = 1   # Rojo
COLOR_FILL = 3   # Verde
COLOR_TN   = 8   # Gris oscuro
COLOR_PLT  = 5   # Azul
COLOR_TBL  = 7   # Blanco/negro

# Escala de secciones en el dibujo (1:N)
SECTION_SCALE_H = 1.0    # Factor horizontal (distancias reales)
SECTION_SCALE_V = 1.0    # Factor vertical (cotas reales)


# ============================================================================
# 1. TABLA DE VOLÚMENES
# ============================================================================

def create_volume_table(platforms, insert_pt=(0.0, 0.0, 0.0),
                         row_height=8.0, col_widths=None,
                         text_height=2.5, title="MOVIMIENTO DE TIERRAS — PLATAFORMAS"):
    """
    Crea una tabla AutoCAD con los volúmenes calculados de cada plataforma.

    insert_pt : (x, y, z) — esquina superior izquierda de la tabla
    col_widths : lista de anchos de columna (mm en escala 1:1)
    """
    doc  = _acad_doc()
    db   = doc.Database

    default_widths = [25, 15, 15, 15, 22, 22, 22, 18]
    if col_widths is None:
        col_widths = default_widths

    headers = [
        "PLATAFORMA", "PK INICIO", "PK FIN",
        "L (m)", "CORTE (m³)", "RELLENO (m³)",
        "BALANCE (m³)", "Δz (m)"
    ]

    logs = []
    with doc.LockDocument():
        with db.TransactionManager.StartTransaction() as tr:
            bt  = tr.GetObject(db.BlockTableId,  OpenMode.ForRead)
            btr = tr.GetObject(bt[BlockTableRecord.ModelSpace], OpenMode.ForWrite)
            _ensure_layer(db, tr, LAYER_TABLE)

            tbl = Table()
            tbl.SetSize(len(platforms) + 3, len(headers))   # +título +encabezado +totales
            tbl.SetRowHeight(row_height)

            for c, w in enumerate(col_widths):
                tbl.SetColumnWidth(c, w)

            tbl.Layer = LAYER_TABLE
            tbl.Position = Point3d(*insert_pt)

            # Título
            tbl.MergeCells(0, 0, 0, len(headers) - 1)
            tbl.SetTextString(0, 0, title)
            tbl.SetTextHeight(0, 0, text_height * 1.4)
            tbl.SetAlignment(0, 0, AttachmentPoint.MiddleCenter)

            # Encabezados
            for c, h in enumerate(headers):
                tbl.SetTextString(1, c, h)
                tbl.SetTextHeight(1, c, text_height * 0.9)
                tbl.SetAlignment(1, c, AttachmentPoint.MiddleCenter)

            # Filas de datos
            tot_cut = tot_fill = 0.0
            for i, plt in enumerate(platforms):
                row = i + 2
                balance = plt.volume_cut - plt.volume_fill
                offset  = plt.active_offset if hasattr(plt, 'active_offset') else 0.0
                values  = [
                    plt.name,
                    "%.0f" % plt.pk_start,
                    "%.0f" % plt.pk_end,
                    "%.1f" % plt.length,
                    "%.1f" % plt.volume_cut,
                    "%.1f" % plt.volume_fill,
                    "%+.1f" % balance,
                    "%+.3f" % offset,
                ]
                for c, v in enumerate(values):
                    tbl.SetTextString(row, c, v)
                    tbl.SetTextHeight(row, c, text_height)
                    align = AttachmentPoint.MiddleCenter if c == 0 else AttachmentPoint.MiddleRight
                    tbl.SetAlignment(row, c, align)
                tot_cut  += plt.volume_cut
                tot_fill += plt.volume_fill

            # Fila de totales
            last_row = len(platforms) + 2
            tbl.MergeCells(last_row, 0, last_row, 3)
            tbl.SetTextString(last_row, 0, "TOTAL")
            tbl.SetTextHeight(last_row, 0, text_height)
            tbl.SetAlignment(last_row, 0, AttachmentPoint.MiddleCenter)
            tbl.SetTextString(last_row, 4, "%.1f" % tot_cut)
            tbl.SetTextString(last_row, 5, "%.1f" % tot_fill)
            tbl.SetTextString(last_row, 6, "%+.1f" % (tot_cut - tot_fill))
            for c in range(4, len(headers)):
                tbl.SetTextHeight(last_row, c, text_height)
                tbl.SetAlignment(last_row, c, AttachmentPoint.MiddleRight)

            tbl.GenerateLayout()
            btr.AppendEntity(tbl)
            tr.AddNewlyCreatedDBObject(tbl, True)
            tr.Commit()

    logs.append("Tabla de volúmenes creada en (%.0f, %.0f)" % (insert_pt[0], insert_pt[1]))
    logs.append("  Totales — Corte: %.1f m³  Relleno: %.1f m³  Balance: %+.1f m³"
                % (tot_cut, tot_fill, tot_cut - tot_fill))
    return logs


# ============================================================================
# 2. ACHURADO EN PLANTA (corte = rojo, relleno = verde)
# ============================================================================

def create_plan_hatching(surface_id, alignment_id, profile_id, platforms,
                          road_half_width=ROAD_HALF_WIDTH_M,
                          cross_slope_road_pct=CROSS_SLOPE_ROAD_PCT,
                          cross_slope_plt_pct=CROSS_SLOPE_PLT_PCT,
                          spacing=SECTION_SPACING_M):
    """
    Para cada plataforma, genera polilíneas de contorno y las acha con:
      · ANSI31 rojo  → zona de corte
      · ANSI37 verde → zona de relleno

    El contorno se construye estación por estación usando:
      lado interior (borde calzada) → FL-BORDE → FL-TALUD → vuelta
    """
    doc  = _acad_doc()
    db   = doc.Database
    logs = []

    with doc.LockDocument():
        with db.TransactionManager.StartTransaction() as tr:
            bt  = tr.GetObject(db.BlockTableId,  OpenMode.ForRead)
            btr = tr.GetObject(bt[BlockTableRecord.ModelSpace], OpenMode.ForWrite)
            _ensure_layer(db, tr, LAYER_HATCH_CUT)
            _ensure_layer(db, tr, LAYER_HATCH_FILL)

            for plt in platforms:
                n   = max(4, int(math.ceil(plt.length / spacing)) + 1)
                sts = [plt.pk_start + plt.length * i / (n - 1) for i in range(n)]

                sides = []
                if plt.side in ('right', 'both'): sides.append(+1)
                if plt.side in ('left',  'both'): sides.append(-1)

                for sign in sides:
                    tag = 'R' if sign > 0 else 'L'
                    edge_pts  = []   # borde plataforma
                    talud_pts = []   # corona/pie de talud

                    for st in sts:
                        edge_off = sign * (road_half_width + plt.width)
                        z_b = plt.z_at(profile_id, st, plt.width,
                                        road_half_width, cross_slope_road_pct,
                                        cross_slope_plt_pct)
                        xe, ye   = _xy(alignment_id, st, edge_off)
                        z_tn_e   = _tn_z(surface_id, xe, ye)
                        edge_pts.append(Point2d(xe, ye))

                        if z_tn_e is not None:
                            is_cut = z_tn_e > z_b
                            o_int, _, _ = _find_talud_intersection(
                                surface_id, alignment_id, st,
                                edge_off, z_b, is_cut,
                                plt.cut_hv, plt.fill_hv
                            )
                            if o_int is not None:
                                xt, yt = _xy(alignment_id, st, o_int)
                                talud_pts.append((Point2d(xt, yt), is_cut))
                            else:
                                talud_pts.append((Point2d(xe, ye), is_cut))
                        else:
                            talud_pts.append((Point2d(xe, ye), True))

                    # Clasificar como mayoría corte o relleno
                    n_cut  = sum(1 for _, ic in talud_pts if ic)
                    is_cut_dominant = n_cut >= len(talud_pts) / 2.0

                    layer  = LAYER_HATCH_CUT  if is_cut_dominant else LAYER_HATCH_FILL
                    color  = COLOR_CUT        if is_cut_dominant else COLOR_FILL
                    pattern = "ANSI31"        if is_cut_dominant else "ANSI37"

                    # Construir polilínea de contorno (borde → talud → vuelta)
                    boundary = _make_boundary_polyline(edge_pts,
                                                        [p for p, _ in talud_pts])
                    if boundary is None:
                        continue

                    boundary.Layer = layer
                    boundary.Color = Color.FromColorIndex(ColorMethod.ByAci, color)
                    btr.AppendEntity(boundary)
                    tr.AddNewlyCreatedDBObject(boundary, True)

                    # Crear achura
                    hatch = Hatch()
                    hatch.SetHatchPattern(HatchPatternType.PreDefined, pattern)
                    hatch.HatchStyle = HatchStyle.Normal
                    hatch.PatternScale = 5.0
                    hatch.Layer = layer
                    hatch.Color = Color.FromColorIndex(ColorMethod.ByAci, color)
                    btr.AppendEntity(hatch)
                    tr.AddNewlyCreatedDBObject(hatch, True)

                    loops = ObjectIdCollection()
                    loops.Add(boundary.ObjectId)
                    hatch.AppendLoop(HatchLoopTypes.Default, loops)
                    hatch.EvaluateHatch(True)

                    logs.append("[%s-%s] Achura %s (%s)" % (plt.name, tag, pattern, layer))

            tr.Commit()
    return logs


def _make_boundary_polyline(edge_pts, talud_pts):
    """Polilínea 2D cerrada: borde_0..borde_n + talud_n..talud_0."""
    if len(edge_pts) < 2 or len(talud_pts) < 2:
        return None
    pl = Polyline()
    pl.Closed = True
    idx = 0
    for pt in edge_pts:
        pl.AddVertexAt(idx, pt, 0.0, 0.0, 0.0); idx += 1
    for pt in reversed(talud_pts):
        pl.AddVertexAt(idx, pt, 0.0, 0.0, 0.0); idx += 1
    return pl


# ============================================================================
# 3. ETIQUETAS DE PLATAFORMA EN PLANTA
# ============================================================================

def create_platform_labels(alignment_id, profile_id, platforms,
                             road_half_width=ROAD_HALF_WIDTH_M,
                             text_height=3.0):
    """
    Mtext en el centroide de cada plataforma con:
      nombre | PK inicio–fin | Corte / Relleno / Balance
    """
    doc  = _acad_doc()
    db   = doc.Database
    logs = []

    with doc.LockDocument():
        with db.TransactionManager.StartTransaction() as tr:
            bt  = tr.GetObject(db.BlockTableId, OpenMode.ForRead)
            btr = tr.GetObject(bt[BlockTableRecord.ModelSpace], OpenMode.ForWrite)
            _ensure_layer(db, tr, LAYER_LABEL)

            for plt in platforms:
                st_mid   = (plt.pk_start + plt.pk_end) / 2.0
                sign     = +1.0 if plt.side in ('right', 'both') else -1.0
                off_mid  = sign * (road_half_width + plt.width / 2.0)
                xm, ym   = _xy(alignment_id, st_mid, off_mid)
                z_cl     = _profile_elev(profile_id, st_mid)

                balance  = plt.volume_cut - plt.volume_fill
                offset   = plt.active_offset if hasattr(plt, 'active_offset') else 0.0

                lines = [
                    "{\\fArial|b1|i0;%s}"  % plt.name,
                    "PK %.0f – %.0f  (L=%.1fm)" % (plt.pk_start, plt.pk_end, plt.length),
                    "Corte:   %.1f m³"   % plt.volume_cut,
                    "Relleno: %.1f m³"   % plt.volume_fill,
                    "Balance: %+.1f m³"  % balance,
                    "Δz = %+.3f m"        % offset,
                ]

                mt = MText()
                mt.Location   = Point3d(xm, ym, z_cl)
                mt.TextHeight = text_height
                mt.Width      = 40.0
                mt.Attachment = AttachmentPoint.MiddleCenter
                mt.Layer      = LAYER_LABEL
                mt.Color      = Color.FromColorIndex(ColorMethod.ByAci, 7)
                mt.Contents   = "\\P".join(lines)

                btr.AppendEntity(mt)
                tr.AddNewlyCreatedDBObject(mt, True)
                logs.append("[%s] Etiqueta en (%.0f, %.0f)" % (plt.name, xm, ym))

            tr.Commit()
    return logs


# ============================================================================
# 4. SECCIONES TRANSVERSALES ESQUEMÁTICAS
# ============================================================================

def create_cross_section_drawings(surface_id, alignment_id, profile_id,
                                   platforms,
                                   origin=(0.0, -200.0, 0.0),
                                   grid_cols=3,
                                   section_h_spacing=120.0,
                                   section_v_spacing=80.0,
                                   road_half_width=ROAD_HALF_WIDTH_M,
                                   cross_slope_road_pct=CROSS_SLOPE_ROAD_PCT,
                                   cross_slope_plt_pct=CROSS_SLOPE_PLT_PCT,
                                   n_pts=30,
                                   exaggeration_v=2.0):
    """
    Dibuja secciones transversales esquemáticas a 3 estaciones por plataforma
    (entrada, centro, salida) en una cuadrícula en el espacio modelo.

    Cada sección muestra:
      · Polilínea azul  → superficie de la plataforma
      · Polilínea gris  → terreno natural (TN)
      · Líneas rojas    → taludes de corte
      · Líneas verdes   → taludes de relleno
      · Texto de título → nombre + estación
    """
    doc  = _acad_doc()
    db   = doc.Database
    logs = []
    ox, oy, oz = origin

    with doc.LockDocument():
        with db.TransactionManager.StartTransaction() as tr:
            bt  = tr.GetObject(db.BlockTableId, OpenMode.ForRead)
            btr = tr.GetObject(bt[BlockTableRecord.ModelSpace], OpenMode.ForWrite)
            _ensure_layer(db, tr, LAYER_SECTION)
            _ensure_layer(db, tr, LAYER_LABEL)

            idx = 0
            for plt in platforms:
                stations_to_draw = [
                    ("entrada", plt.pk_start + plt.length * 0.05),
                    ("centro",  plt.pk_start + plt.length * 0.50),
                    ("salida",  plt.pk_start + plt.length * 0.95),
                ]
                for label, st in stations_to_draw:
                    col = idx % grid_cols
                    row = idx // grid_cols
                    cx  = ox + col * section_h_spacing
                    cy  = oy - row * section_v_spacing

                    _draw_one_section(
                        btr, tr, db,
                        surface_id, alignment_id, profile_id,
                        st, plt, cx, cy,
                        road_half_width, cross_slope_road_pct,
                        cross_slope_plt_pct, n_pts, exaggeration_v,
                        label
                    )
                    logs.append("[%s] Sección %s PK=%.1f en (%.0f,%.0f)"
                                % (plt.name, label, st, cx, cy))
                    idx += 1

            tr.Commit()
    return logs


def _draw_one_section(btr, tr, db,
                       surface_id, alignment_id, profile_id,
                       station, plt, cx, cy,
                       road_half_width, cross_slope_road_pct,
                       cross_slope_plt_pct, n_pts, exag_v, label):
    """Dibuja una sola sección transversal en el punto (cx, cy)."""

    sides = []
    if plt.side in ('right', 'both'): sides.append(+1)
    if plt.side in ('left',  'both'): sides.append(-1)

    # Encontrar rango de offsets para escalar la sección
    max_offset = road_half_width + plt.width + 30.0   # buffer para talud

    # Recopilar puntos de la sección
    def sample(sign):
        pts_plt = []; pts_tn = []
        for k in range(n_pts + 1):
            off  = sign * (road_half_width + plt.width * k / n_pts)
            dist = abs(abs(off) - road_half_width)
            z_p  = plt.z_at(profile_id, station, dist,
                             road_half_width, cross_slope_road_pct,
                             cross_slope_plt_pct)
            x, y = _xy(alignment_id, station, off)
            z_tn = _tn_z(surface_id, x, y)
            pts_plt.append((off, z_p))
            pts_tn.append((off, z_tn if z_tn is not None else z_p))

        # Zona de talud
        edge_off  = sign * (road_half_width + plt.width)
        z_b = plt.z_at(profile_id, station, plt.width,
                        road_half_width, cross_slope_road_pct, cross_slope_plt_pct)
        xe, ye   = _xy(alignment_id, station, edge_off)
        z_tn_e   = _tn_z(surface_id, xe, ye)
        pts_talud_plt = []; pts_talud_tn = []

        if z_tn_e is not None:
            is_cut = z_tn_e > z_b
            o_int, _, d_int = _find_talud_intersection(
                surface_id, alignment_id, station,
                edge_off, z_b, is_cut,
                plt.cut_hv, plt.fill_hv
            )
            if d_int is not None:
                hv = plt.cut_hv if is_cut else plt.fill_hv
                for k in range(n_pts // 2 + 1):
                    d   = d_int * k / (n_pts // 2)
                    off = edge_off + sign * d
                    z_tl = (z_b + d / hv) if is_cut else (z_b - d / hv)
                    xk, yk = _xy(alignment_id, station, off)
                    z_tn_k = _tn_z(surface_id, xk, yk)
                    pts_talud_plt.append((off, z_tl))
                    pts_talud_tn.append((off, z_tn_k if z_tn_k is not None else z_tl))

        return pts_plt, pts_tn, pts_talud_plt, pts_talud_tn, is_cut if z_tn_e else True

    # Normalizar para dibujo: offset → x_local, z → y_local con exageración
    z_ref = _profile_elev(profile_id, station)
    z_margin = 3.0 * exag_v

    def to_local(off, z):
        x_l = off * 1.0          # escala horizontal 1:1 en el dibujo
        y_l = (z - z_ref) * exag_v
        return cx + x_l, cy + y_l

    def draw_pline(pts_oz, color, layer, closed=False):
        if len(pts_oz) < 2:
            return
        pl = Polyline()
        pl.Layer  = layer
        pl.Color  = Color.FromColorIndex(ColorMethod.ByAci, color)
        pl.Closed = closed
        for idx, (o, z) in enumerate(pts_oz):
            if z is None: continue
            x_d, y_d = to_local(o, z)
            pl.AddVertexAt(idx, Point2d(x_d, y_d), 0.0, 0.0, 0.0)
        btr.AppendEntity(pl)
        tr.AddNewlyCreatedDBObject(pl, True)

    for sign in sides:
        pp, ptn, tp, ttn, is_cut = sample(sign)
        # TN (gris)
        draw_pline(ptn,  COLOR_TN,  LAYER_SECTION)
        # Plataforma (azul)
        draw_pline(pp,   COLOR_PLT, LAYER_SECTION)
        # Talud TN
        draw_pline(ttn,  COLOR_TN,  LAYER_SECTION)
        # Talud línea teórica
        talud_color = COLOR_CUT if is_cut else COLOR_FILL
        draw_pline(tp,   talud_color, LAYER_SECTION)

    # Línea de referencia horizontal (cota rasante)
    ref_y = cy
    ln = Line(Point3d(cx - max_offset, ref_y, 0),
              Point3d(cx + max_offset, ref_y, 0))
    ln.Layer  = LAYER_SECTION
    ln.Color  = Color.FromColorIndex(ColorMethod.ByAci, COLOR_TN)
    ln.LinetypeScale = 1.0
    btr.AppendEntity(ln); tr.AddNewlyCreatedDBObject(ln, True)

    # Título de la sección
    txt = DBText()
    txt.Position          = Point3d(cx, cy + 15, 0)
    txt.TextString        = "%s — %s  PK %.1f" % (plt.name, label.upper(), station)
    txt.Height            = 2.5
    txt.HorizontalMode    = TextHorizontalMode.TextCenter
    txt.AlignmentPoint    = Point3d(cx, cy + 15, 0)
    txt.Layer             = LAYER_LABEL
    txt.Color             = Color.FromColorIndex(ColorMethod.ByAci, 7)
    btr.AppendEntity(txt); tr.AddNewlyCreatedDBObject(txt, True)


# ============================================================================
# 5. LAYOUT DE PRESENTACIÓN
# ============================================================================

def create_presentation_layout(layout_name="PLATAFORMAS",
                                paper_w=841.0, paper_h=594.0,
                                plan_scale=500,
                                table_origin=(10.0, 400.0, 0.0)):
    """
    Crea un layout A1 apaisado con:
      · Viewport de planta a escala 1:plan_scale (ocupa 70% del ancho)
      · Viewport de secciones transversales (30% derecho)
      · Tabla de volúmenes ya creada en el espacio modelo (ref. table_origin)
    """
    doc  = _acad_doc()
    db   = doc.Database
    logs = []

    with doc.LockDocument():
        with db.TransactionManager.StartTransaction() as tr:
            lm = LayoutManager.Current

            # Crear o reutilizar el layout
            try:
                lay_id  = lm.CreateLayout(layout_name)
                layout  = tr.GetObject(lay_id, OpenMode.ForWrite)
                logs.append("Layout '%s' creado." % layout_name)
            except Exception:
                # Ya existe — usar el existente
                lay_id  = lm.GetLayoutId(layout_name)
                layout  = tr.GetObject(lay_id, OpenMode.ForWrite)
                logs.append("Layout '%s' ya existe — reutilizando." % layout_name)

            layout.SetPlotSettings(
                layout.GetCanonicalMediaName(),
                "DWG to PDF.pc3", "ISO_A1_(841.00_x_594.00_MM)"
            )

            bt  = tr.GetObject(db.BlockTableId, OpenMode.ForRead)
            btr = tr.GetObject(layout.BlockTableRecordId, OpenMode.ForWrite)

            # Márgenes
            mx, my = 10.0, 10.0

            # Viewport planta (lado izquierdo, 65% del ancho)
            vp_w_plan  = paper_w * 0.65 - 2 * mx
            vp_h_plan  = paper_h - 2 * my - 50   # espacio para tabla arriba
            vp_plan = Viewport()
            vp_plan.Width  = vp_w_plan
            vp_plan.Height = vp_h_plan
            vp_plan.CenterPoint = Point3d(mx + vp_w_plan / 2.0,
                                          my + 50 + vp_h_plan / 2.0, 0)
            vp_plan.CustomScale = 1.0 / plan_scale
            vp_plan.On   = True
            vp_plan.Layer = "DEFPOINTS"
            btr.AppendEntity(vp_plan)
            tr.AddNewlyCreatedDBObject(vp_plan, True)
            logs.append("Viewport planta 1:%d (%.0f×%.0f mm)" % (plan_scale, vp_w_plan, vp_h_plan))

            # Viewport secciones (lado derecho)
            vp_w_sect = paper_w * 0.35 - mx
            vp_h_sect = vp_h_plan
            vp_sect = Viewport()
            vp_sect.Width  = vp_w_sect
            vp_sect.Height = vp_h_sect
            vp_sect.CenterPoint = Point3d(paper_w * 0.65 + mx + vp_w_sect / 2.0,
                                           my + 50 + vp_h_sect / 2.0, 0)
            vp_sect.CustomScale = 1.0 / (plan_scale // 2)
            vp_sect.On   = True
            vp_sect.Layer = "DEFPOINTS"
            btr.AppendEntity(vp_sect)
            tr.AddNewlyCreatedDBObject(vp_sect, True)
            logs.append("Viewport secciones 1:%d" % (plan_scale // 2))

            lm.CurrentLayout = layout_name
            tr.Commit()

    return logs


# ============================================================================
# LEYENDA DE CAPAS
# ============================================================================

def create_legend(insert_pt=(0.0, -50.0, 0.0), text_height=2.5):
    """
    Inserta una leyenda compacta con los colores y patrones usados.
    """
    doc  = _acad_doc()
    db   = doc.Database
    logs = []
    items = [
        (COLOR_CUT,  LAYER_HATCH_CUT,  "ANSI31", "Zona de CORTE"),
        (COLOR_FILL, LAYER_HATCH_FILL, "ANSI37", "Zona de RELLENO"),
        (COLOR_PLT,  LAYER_SECTION,    "———",    "Superficie plataforma"),
        (COLOR_TN,   LAYER_SECTION,    "———",    "Terreno natural (TN)"),
    ]
    ox, oy, oz = insert_pt
    dy = text_height * 2.0

    with doc.LockDocument():
        with db.TransactionManager.StartTransaction() as tr:
            bt  = tr.GetObject(db.BlockTableId, OpenMode.ForRead)
            btr = tr.GetObject(bt[BlockTableRecord.ModelSpace], OpenMode.ForWrite)
            _ensure_layer(db, tr, LAYER_LABEL)

            for i, (color, layer, pattern, desc) in enumerate(items):
                y = oy - i * dy
                # Muestra de color (línea corta)
                ln = Line(Point3d(ox, y, oz), Point3d(ox + 15, y, oz))
                ln.Color = Color.FromColorIndex(ColorMethod.ByAci, color)
                ln.Layer = LAYER_LABEL
                btr.AppendEntity(ln); tr.AddNewlyCreatedDBObject(ln, True)
                # Texto
                txt = DBText()
                txt.Position        = Point3d(ox + 18, y - text_height * 0.3, oz)
                txt.TextString      = desc
                txt.Height          = text_height
                txt.Layer           = LAYER_LABEL
                txt.Color           = Color.FromColorIndex(ColorMethod.ByAci, 7)
                btr.AppendEntity(txt); tr.AddNewlyCreatedDBObject(txt, True)

            # Título leyenda
            t = DBText()
            t.Position   = Point3d(ox, oy + dy, oz)
            t.TextString = "LEYENDA"
            t.Height     = text_height * 1.3
            t.Layer      = LAYER_LABEL
            t.Color      = Color.FromColorIndex(ColorMethod.ByAci, 7)
            btr.AppendEntity(t); tr.AddNewlyCreatedDBObject(t, True)

            tr.Commit()
    logs.append("Leyenda creada en (%.0f, %.0f)" % (insert_pt[0], insert_pt[1]))
    return logs


# ============================================================================
# FUNCIÓN MAESTRA: PLANO COMPLETO
# ============================================================================

def generate_full_plan(surface_id, alignment_id, profile_id, platforms,
                        road_half_width=ROAD_HALF_WIDTH_M,
                        cross_slope_road_pct=CROSS_SLOPE_ROAD_PCT,
                        cross_slope_plt_pct=CROSS_SLOPE_PLT_PCT,
                        spacing=SECTION_SPACING_M,
                        create_layout=True,
                        plan_scale=500,
                        layout_name="PLATAFORMAS",
                        table_x=0.0, table_y=200.0,
                        sections_x=0.0, sections_y=-200.0,
                        legend_x=0.0,  legend_y=-100.0,
                        section_exag_v=2.0):
    """
    Genera el plano completo en una sola llamada.
    Retorna lista de mensajes de log.
    """
    logs = ["=== GENERACIÓN DE PLANO FINAL ==="]

    logs.append("--- Tabla de volúmenes ---")
    logs += create_volume_table(
        platforms,
        insert_pt=(table_x, table_y, 0.0)
    )

    logs.append("--- Achurado en planta ---")
    logs += create_plan_hatching(
        surface_id, alignment_id, profile_id, platforms,
        road_half_width=road_half_width,
        cross_slope_road_pct=cross_slope_road_pct,
        cross_slope_plt_pct=cross_slope_plt_pct,
        spacing=spacing,
    )

    logs.append("--- Etiquetas de plataformas ---")
    logs += create_platform_labels(
        alignment_id, profile_id, platforms,
        road_half_width=road_half_width,
    )

    logs.append("--- Secciones transversales ---")
    logs += create_cross_section_drawings(
        surface_id, alignment_id, profile_id, platforms,
        origin=(sections_x, sections_y, 0.0),
        road_half_width=road_half_width,
        cross_slope_road_pct=cross_slope_road_pct,
        cross_slope_plt_pct=cross_slope_plt_pct,
        exaggeration_v=section_exag_v,
    )

    logs.append("--- Leyenda ---")
    logs += create_legend(insert_pt=(legend_x, legend_y, 0.0))

    if create_layout:
        logs.append("--- Layout de presentación ---")
        logs += create_presentation_layout(
            layout_name=layout_name,
            plan_scale=plan_scale,
        )

    logs.append("=== PLANO COMPLETO ===")
    return logs
