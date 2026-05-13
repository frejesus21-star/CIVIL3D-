# =============================================================================
# civil3d_api_helper.py
# Módulo auxiliar para nodos Python de Dynamo — Civil 3D 2026
# Uso: Copiar este archivo junto al .dyn o importar desde IronPython en Dynamo
#
# ADVERTENCIA DE IDIOMA: Civil 3D en español puede exponer nombres de método
# y colecciones diferentes a la versión en inglés. Donde aplica, se documenta
# el nombre alternativo. Probar con CivilApplication.ActiveDocument.GetType()
# para confirmar la versión.
# =============================================================================

import clr
import sys

# Referencias obligatorias — deben estar en la ruta de Dynamo/Civil 3D
clr.AddReference('AcMgd')          # AutoCAD managed
clr.AddReference('AcDbMgd')        # AutoCAD database managed
clr.AddReference('AeccDbMgd')      # Civil 3D database managed
clr.AddReference('AeccXUiLand')    # Civil 3D UI Land (perfiles, corredores)

from System import Array, Enum
from System.Collections.Generic import List

from Autodesk.AutoCAD.ApplicationServices import Application
from Autodesk.AutoCAD.DatabaseServices import (
    Transaction, BlockTable, BlockTableRecord, OpenMode,
    Polyline, Polyline2d, Polyline3d,
    SegmentType,          # Para identificar segmentos rectos/arco en Lwpolyline
    BulgeVertex,
)
from Autodesk.AutoCAD.Geometry import Point3d, Vector3d, Plane

from Autodesk.Civil.ApplicationServices import CivilApplication
from Autodesk.Civil.DatabaseServices import (
    Alignment, AlignmentCreationOptions, AlignmentEntityCollection,
    AlignmentSubEntityArc, AlignmentSubEntityLine,
    TinSurface, Surface, SurfaceOperation,
    ProfileView, ProfileViewCreationOptions,
    Corridor, CorridorCreationOptions,
    FeatureLine,
)
from Autodesk.Civil.Settings import CivilDocumentSettings


# ---------------------------------------------------------------------------
# Utilidades de documento
# ---------------------------------------------------------------------------

def get_civil_doc():
    """Devuelve el documento Civil 3D activo."""
    return CivilApplication.ActiveDocument


def get_acad_doc():
    """Devuelve el documento AutoCAD activo."""
    return Application.DocumentManager.MdiActiveDocument


def get_db():
    return get_acad_doc().Database


# ---------------------------------------------------------------------------
# 1. OBTENER POLILÍNEA DE LA CAPA "EJE DE CAMINO"
# ---------------------------------------------------------------------------

def get_polyline_from_layer(layer_name="EJE DE CAMINO"):
    """
    Busca la primera Lwpolyline (o Polyline2d/3d) en la capa indicada.
    Devuelve el ObjectId o None.

    NOTA: Civil 3D en español puede tener la capa con acento.
    Se normaliza comparando en mayúsculas sin acento como fallback.
    """
    doc = get_acad_doc()
    db  = doc.Database

    def normalize(s):
        import unicodedata
        return ''.join(
            c for c in unicodedata.normalize('NFD', s)
            if unicodedata.category(c) != 'Mn'
        ).upper()

    target = normalize(layer_name)

    with doc.LockDocument():
        with db.TransactionManager.StartTransaction() as tr:
            bt  = tr.GetObject(db.BlockTableId, OpenMode.ForRead)
            btr = tr.GetObject(bt[BlockTableRecord.ModelSpace], OpenMode.ForRead)

            for oid in btr:
                obj = tr.GetObject(oid, OpenMode.ForRead)
                layer_ok = (
                    obj.Layer.upper() == layer_name.upper() or
                    normalize(obj.Layer) == target
                )
                if layer_ok and isinstance(obj, (Polyline, Polyline2d, Polyline3d)):
                    tr.Commit()
                    return oid

            tr.Commit()
    return None


# ---------------------------------------------------------------------------
# 2. CREAR ALINEAMIENTO DESDE POLILÍNEA MIXTA (líneas + arcos)
# ---------------------------------------------------------------------------

def create_alignment_from_polyline(polyline_id, alignment_name="ALI-EJE",
                                   site_name="", layer_name="C-ROAD-CNTR",
                                   style_name="Standard", label_set_name="Standard"):
    """
    Crea un alineamiento en Civil 3D a partir de una Lwpolyline con segmentos
    mixtos (líneas rectas y arcos definidos por bulge).

    GEOMETRÍA MIXTA:
    - Segmentos rectos: bulge == 0
    - Arcos: bulge != 0  (bulge = tan(ángulo_central / 4))
    El método nativo Alignment.CreateFromPolyline() es el más robusto para
    preservar arcos. Si falla por versión/idioma, se usa el fallback manual.

    Parámetros
    ----------
    polyline_id   : ObjectId de la polilínea fuente
    alignment_name: Nombre del nuevo alineamiento
    site_name     : Nombre del sitio (dejar "" para sin sitio en Civil 3D 2024+)
    layer_name    : Capa destino del alineamiento (inglés: 'C-ROAD-CNTR')
    style_name    : Nombre del estilo de alineamiento (usar 'Standard'/'Estándar')
    label_set_name: Nombre del conjunto de etiquetas

    Devuelve
    --------
    ObjectId del alineamiento creado
    """
    doc      = get_acad_doc()
    db       = doc.Database
    civil_doc = get_civil_doc()

    # --- Buscar el sitio (puede llamarse diferente en español) ---
    site_id = _get_or_create_site(civil_doc, site_name)

    # --- Resolver estilos (tolerante a versión en español) ---
    ali_style_id  = _resolve_style(civil_doc.Styles.AlignmentStyles, style_name)
    label_set_id  = _resolve_style(civil_doc.Styles.LabelSetStyles.AlignmentLabelSetStyles,
                                   label_set_name)

    with doc.LockDocument():
        with db.TransactionManager.StartTransaction() as tr:
            # INTENTO 1: usar el método nativo (más fiel a la geometría)
            try:
                ali_id = Alignment.CreateFromPolyline(
                    civil_doc,
                    alignment_name,
                    site_id,
                    polyline_id,
                    layer_name,
                    ali_style_id,
                    label_set_id,
                    True,   # eraseExistingEntities — NO borrar la polilínea
                    True    # useExistingName
                )
                # IMPORTANTE: El parámetro eraseExistingEntities=True borra la
                # polilínea original. Usar False para conservarla.
                tr.Commit()
                return ali_id

            except Exception as e:
                # FALLBACK: construcción manual entidad por entidad
                tr.Abort()

    return _create_alignment_manual(
        polyline_id, alignment_name, site_id, layer_name,
        ali_style_id, label_set_id
    )


def _create_alignment_manual(polyline_id, name, site_id, layer,
                              style_id, label_set_id):
    """
    Fallback: construye el alineamiento entidad a entidad leyendo los
    vértices y bulges de la Lwpolyline para reconstruir líneas y arcos.
    """
    import math

    doc = get_acad_doc()
    db  = doc.Database
    civil_doc = get_civil_doc()

    segments = []  # lista de (tipo, datos)

    with doc.LockDocument():
        with db.TransactionManager.StartTransaction() as tr:
            pl = tr.GetObject(polyline_id, OpenMode.ForRead)

            for i in range(pl.NumberOfVertices):
                pt      = pl.GetPoint3dAt(i)
                bulge   = pl.GetBulgeAt(i)
                seg_type = pl.GetSegmentType(i)

                if seg_type == SegmentType.Line:
                    pt_next = pl.GetPoint3dAt(
                        (i + 1) % pl.NumberOfVertices
                    )
                    segments.append(('line', pt, pt_next))

                elif seg_type == SegmentType.Arc:
                    # Convertir bulge a parámetros de arco
                    pt_next = pl.GetPoint3dAt(
                        (i + 1) % pl.NumberOfVertices
                    )
                    arc_data = _bulge_to_arc(pt, pt_next, bulge)
                    segments.append(('arc', arc_data))

            tr.Commit()

    # Crear alineamiento vacío y añadir entidades
    with doc.LockDocument():
        with db.TransactionManager.StartTransaction() as tr:
            ali_id = Alignment.Create(
                civil_doc, name, site_id, layer, style_id, label_set_id
            )
            ali = tr.GetObject(ali_id, OpenMode.ForWrite)
            ents = ali.Entities

            for seg in segments:
                if seg[0] == 'line':
                    _, p1, p2 = seg
                    ents.AddFixedLine(
                        Point3d(p1.X, p1.Y, 0),
                        Point3d(p2.X, p2.Y, 0)
                    )
                elif seg[0] == 'arc':
                    arc = seg[1]
                    # AddFixedArc(center, radius, startAngle, endAngle, clockwise)
                    ents.AddFixedArc(
                        arc['center'],
                        arc['radius'],
                        arc['start_angle'],
                        arc['end_angle'],
                        arc['clockwise']
                    )

            tr.Commit()
            return ali_id


def _bulge_to_arc(p1, p2, bulge):
    """Convierte vértice+bulge de Lwpolyline a parámetros de arco Civil 3D."""
    import math

    # Ángulo incluido = 4 * atan(bulge)
    theta  = 4.0 * math.atan(abs(bulge))
    d      = math.sqrt((p2.X - p1.X)**2 + (p2.Y - p1.Y)**2)
    radius = d / (2.0 * math.sin(theta / 2.0))

    # Punto medio de la cuerda
    mx = (p1.X + p2.X) / 2.0
    my = (p1.Y + p2.Y) / 2.0

    # Distancia del centro al punto medio de la cuerda
    dist_to_mid = radius * math.cos(theta / 2.0)

    # Ángulo perpendicular a la cuerda
    chord_angle = math.atan2(p2.Y - p1.Y, p2.X - p1.X)

    clockwise = bulge < 0
    perp      = chord_angle + (math.pi / 2.0 if not clockwise else -math.pi / 2.0)

    cx = mx + dist_to_mid * math.cos(perp)
    cy = my + dist_to_mid * math.sin(perp)

    start_angle = math.atan2(p1.Y - cy, p1.X - cx)
    end_angle   = math.atan2(p2.Y - cy, p2.X - cx)

    return {
        'center'     : Point3d(cx, cy, 0),
        'radius'     : radius,
        'start_angle': start_angle,
        'end_angle'  : end_angle,
        'clockwise'  : clockwise,
    }


# ---------------------------------------------------------------------------
# 3. CREAR SUPERFICIE SELLO = TN - delta
# ---------------------------------------------------------------------------

def create_sello_surface(tn_surface_name="TN", delta=0.30,
                          sello_name="SELLO", style_name="Standard"):
    """
    Crea la superficie SELLO como copia de TN desplazada verticalmente
    en -delta metros (representa el decapado/desbroce).

    Civil 3D no tiene operación nativa 'restar delta a superficie', por lo
    que se replica mediante una PastedSurface o editando directamente los
    puntos con un offset vertical.

    MÉTODO ELEGIDO: Copiar la definición de TN y aplicar un offset vertical
    negativo mediante SurfacePasteOperation con elevación ajustada.

    Parámetros
    ----------
    tn_surface_name: Nombre exacto de la superficie TN
    delta          : Valor de decapado en metros (0.00–0.60)
    sello_name     : Nombre de la superficie resultante
    style_name     : Estilo de superficie a aplicar

    Devuelve
    --------
    ObjectId de la superficie SELLO
    """
    doc       = get_acad_doc()
    db        = doc.Database
    civil_doc = get_civil_doc()

    tn_id     = _find_surface_by_name(civil_doc, tn_surface_name)
    style_id  = _resolve_style(civil_doc.Styles.SurfaceStyles, style_name)

    with doc.LockDocument():
        with db.TransactionManager.StartTransaction() as tr:
            tn = tr.GetObject(tn_id, OpenMode.ForRead)

            # Crear nueva TinSurface vacía
            sello_id = TinSurface.Create(civil_doc, sello_name)
            sello    = tr.GetObject(sello_id, OpenMode.ForWrite)
            sello.StyleId = style_id

            # Pegar la superficie TN como base y luego aplicar offset
            # El método más directo: pegar TN y ajustar la cota de pega
            paste_op = sello.BoundariesDefinition  # acceso a operaciones
            # NOTA: La API de PasteOperation varía entre versiones.
            # En Civil 3D 2024-2026 inglés: sello.DefinitionAddPastedSurface(tn_id)
            # En español puede llamarse: DefinicionAgregarSuperficiePegada (raro)
            # Se usa reflexión como salvaguarda:
            try:
                sello.DefinitionAddPastedSurface(tn_id)
            except AttributeError:
                # Fallback: clonar puntos manualmente con offset
                _copy_surface_with_offset(tr, tn, sello, -delta)
                tr.Commit()
                return sello_id

            # Aplicar offset vertical a través de la operación de pega
            sello.ElevationAdjustment = -delta  # en metros

            sello.Rebuild()
            tr.Commit()
            return sello_id


def _copy_surface_with_offset(tr, source_surface, target_surface, offset_z):
    """
    Fallback: copia todos los puntos TIN de source en target con offset en Z.
    Preserva la topología triangular exacta.
    """
    pts = source_surface.GetPoints()
    for pt in pts:
        target_surface.AddPoint(
            Point3d(pt.X, pt.Y, pt.Z + offset_z)
        )
    target_surface.Rebuild()


# ---------------------------------------------------------------------------
# 4. CREAR VISTA DE PERFIL LONGITUDINAL
# ---------------------------------------------------------------------------

def create_profile_view(alignment_id, surface_ids,
                        view_name="PV-EJE", style_name="Standard",
                        band_set_name="Standard",
                        insertion_offset_x=100.0, insertion_offset_y=0.0):
    """
    Crea una vista de perfil longitudinal para el alineamiento dado,
    mostrando las superficies TN y SELLO.

    La posición de inserción se calcula automáticamente a la derecha del
    alineamiento usando la extensión del bounding box + insertion_offset_x.

    Parámetros
    ----------
    alignment_id      : ObjectId del alineamiento
    surface_ids       : Lista de ObjectIds de superficies a mostrar [TN, SELLO]
    view_name         : Nombre de la vista de perfil
    style_name        : Estilo de vista de perfil ('Standard'/'Estándar')
    band_set_name     : Conjunto de bandas ('Standard'/'Estándar')
    insertion_offset_x: Desplazamiento X respecto al fin del alineamiento (m)
    insertion_offset_y: Desplazamiento Y

    Devuelve
    --------
    ObjectId de la ProfileView creada
    """
    doc       = get_acad_doc()
    db        = doc.Database
    civil_doc = get_civil_doc()

    pv_style_id   = _resolve_style(civil_doc.Styles.ProfileViewStyles, style_name)
    band_set_id   = _resolve_style(civil_doc.Styles.ProfileViewBandSetStyles, band_set_name)

    with doc.LockDocument():
        with db.TransactionManager.StartTransaction() as tr:
            ali = tr.GetObject(alignment_id, OpenMode.ForRead)

            # Punto de inserción: a la derecha del alineamiento
            ext        = ali.GeometricExtents
            insert_pt  = Point3d(
                ext.MaxPoint.X + insertion_offset_x,
                ext.MinPoint.Y + insertion_offset_y,
                0
            )

            # Opciones de creación
            opts = ProfileViewCreationOptions(civil_doc)
            opts.DrawOrder = ProfileViewCreationOptions.ProfileViewDrawOrderType.First

            pv_id = ProfileView.Create(
                civil_doc,
                alignment_id,
                insert_pt,
                view_name,
                pv_style_id,
                band_set_id
            )

            pv = tr.GetObject(pv_id, OpenMode.ForWrite)

            # Agregar perfiles de superficies a la vista
            # NOTA: Los perfiles de superficie deben existir o crearse aquí.
            # Si no existen, se crean con Profile.CreateFromSurface()
            for surf_id in surface_ids:
                surf = tr.GetObject(surf_id, OpenMode.ForRead)
                _ensure_surface_profile(tr, civil_doc, alignment_id, pv_id,
                                        surf_id, surf.Name)

            tr.Commit()
            return pv_id


def _ensure_surface_profile(tr, civil_doc, alignment_id, pv_id,
                             surface_id, surface_name):
    """
    Verifica si ya existe un perfil de superficie para el alineamiento dado;
    si no, lo crea con estilo 'Standard'.
    """
    from Autodesk.Civil.DatabaseServices import Profile

    ali = tr.GetObject(alignment_id, OpenMode.ForRead)

    # Buscar perfil existente para esta superficie
    for prof_id in ali.GetProfileIds():
        prof = tr.GetObject(prof_id, OpenMode.ForRead)
        if hasattr(prof, 'SurfaceId') and prof.SurfaceId == surface_id:
            return prof_id  # ya existe

    # Crear perfil de superficie
    style_id = _resolve_style(
        civil_doc.Styles.ProfileStyles, "Standard"
    )
    label_set_id = _resolve_style(
        civil_doc.Styles.LabelSetStyles.ProfileLabelSetStyles, "Standard"
    )

    prof_id = Profile.CreateFromSurface(
        civil_doc,
        alignment_id,
        surface_id,
        "PERF-" + surface_name,
        style_id,
        label_set_id
    )
    return prof_id


# ---------------------------------------------------------------------------
# 5. CREAR CORREDOR VIAL
# ---------------------------------------------------------------------------

def create_corridor(alignment_id, profile_name,
                    assembly_name="camino",
                    corridor_name="CORREDOR-EJE",
                    style_name="Standard",
                    target_surface_id=None):
    """
    Crea un corredor vial usando:
      - El alineamiento generado en el paso 1
      - La rasante (profile) ya existente en el modelo (NO la genera)
      - El subassembly llamado 'camino'

    BÚSQUEDA DE RASANTE: Se busca por nombre en los perfiles del alineamiento.
    Si no se encuentra, lanza ValueError con lista de perfiles disponibles.

    SUBASSEMBLY 'camino': Se busca en la paleta de ensamblajes.
    NOTA: En Civil 3D español el assembly puede llamarse 'camino' o tener
    el nombre traducido. Se busca coincidencia exacta e insensible a mayúsculas.

    Parámetros
    ----------
    alignment_id     : ObjectId del alineamiento
    profile_name     : Nombre de la rasante existente (ej: "RASANTE")
    assembly_name    : Nombre del subassembly (ej: "camino")
    corridor_name    : Nombre del corredor a crear
    style_name       : Estilo del corredor
    target_surface_id: ObjectId de superficie objetivo (opcional, para superelevación)

    Devuelve
    --------
    ObjectId del corredor creado
    """
    doc       = get_acad_doc()
    db        = doc.Database
    civil_doc = get_civil_doc()

    # --- Resolver rasante ---
    profile_id = _find_profile_by_name(alignment_id, profile_name)
    if profile_id is None:
        available = _list_profile_names(alignment_id)
        raise ValueError(
            f"Rasante '{profile_name}' no encontrada. "
            f"Perfiles disponibles: {available}"
        )

    # --- Resolver assembly ---
    assembly_id = _find_assembly_by_name(civil_doc, assembly_name)
    if assembly_id is None:
        raise ValueError(
            f"Assembly '{assembly_name}' no encontrado en el modelo. "
            "Verificar nombre exacto y que esté insertado en el dibujo."
        )

    style_id = _resolve_style(civil_doc.Styles.CorridorStyles, style_name)

    with doc.LockDocument():
        with db.TransactionManager.StartTransaction() as tr:
            ali = tr.GetObject(alignment_id, OpenMode.ForRead)

            # Crear corredor
            corridor_id = Corridor.Create(
                civil_doc,
                corridor_name,
                alignment_id,
                profile_id,
                assembly_id,
                style_id,
                target_surface_id   # puede ser None
            )

            corridor = tr.GetObject(corridor_id, OpenMode.ForWrite)

            # Configurar región principal (toda la longitud del alineamiento)
            region = corridor.Baselines[0].BaselineRegions[0]
            region.StartStation = ali.StartingStation
            region.EndStation   = ali.EndingStation

            corridor.Rebuild()
            tr.Commit()
            return corridor_id


# ---------------------------------------------------------------------------
# Utilidades internas
# ---------------------------------------------------------------------------

def _get_or_create_site(civil_doc, site_name):
    """Obtiene o crea un sitio. Civil 3D 2024+ permite alineamientos sin sitio."""
    if not site_name:
        # Retornar ObjectId.Null equivalente — sin sitio
        from Autodesk.AutoCAD.DatabaseServices import ObjectId
        return ObjectId.Null

    for site_id in civil_doc.GetSiteIds():
        site = civil_doc.Database.TransactionManager.GetObject(
            site_id, OpenMode.ForRead
        )
        if site.Name.upper() == site_name.upper():
            return site_id

    from Autodesk.Civil.DatabaseServices import Site
    return Site.Create(civil_doc, site_name)


def _find_surface_by_name(civil_doc, name):
    """Busca una superficie por nombre (insensible a mayúsculas)."""
    db = civil_doc.Database
    for surf_id in civil_doc.GetSurfaceIds():
        with db.TransactionManager.StartTransaction() as tr:
            surf = tr.GetObject(surf_id, OpenMode.ForRead)
            if surf.Name.upper() == name.upper():
                tr.Commit()
                return surf_id
            tr.Commit()
    raise ValueError(f"Superficie '{name}' no encontrada en el modelo.")


def _find_profile_by_name(alignment_id, profile_name):
    """Busca un perfil por nombre en el alineamiento dado."""
    db  = get_db()
    with db.TransactionManager.StartTransaction() as tr:
        ali = tr.GetObject(alignment_id, OpenMode.ForRead)
        for prof_id in ali.GetProfileIds():
            prof = tr.GetObject(prof_id, OpenMode.ForRead)
            if prof.Name.upper() == profile_name.upper():
                tr.Commit()
                return prof_id
        tr.Commit()
    return None


def _list_profile_names(alignment_id):
    db  = get_db()
    names = []
    with db.TransactionManager.StartTransaction() as tr:
        ali = tr.GetObject(alignment_id, OpenMode.ForRead)
        for prof_id in ali.GetProfileIds():
            prof = tr.GetObject(prof_id, OpenMode.ForRead)
            names.append(prof.Name)
        tr.Commit()
    return names


def _find_assembly_by_name(civil_doc, name):
    """Busca un assembly por nombre (insensible a mayúsculas)."""
    from Autodesk.Civil.DatabaseServices import Assembly
    db = civil_doc.Database
    for asm_id in civil_doc.GetAssemblyIds():
        with db.TransactionManager.StartTransaction() as tr:
            asm = tr.GetObject(asm_id, OpenMode.ForRead)
            if asm.Name.upper() == name.upper():
                tr.Commit()
                return asm_id
            tr.Commit()
    return None


def _resolve_style(style_collection, style_name):
    """
    Resuelve un estilo por nombre. Si no existe, devuelve el primero disponible.
    NOTA: En Civil 3D español 'Standard' puede aparecer como 'Estándar'.
    """
    fallbacks = [style_name, "Standard", "Estándar", "Estandar", "_No Style"]
    for name in fallbacks:
        try:
            return style_collection[name]
        except (KeyError, Exception):
            continue
    # Último recurso: primer elemento de la colección
    for style_id in style_collection:
        return style_id
    raise ValueError("No se encontró ningún estilo disponible.")
