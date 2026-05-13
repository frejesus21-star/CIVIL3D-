# Script Dynamo — Automatización Diseño Vial Civil 3D 2026

## Archivos del proyecto

| Archivo | Descripción |
|---|---|
| `DisenoVial_AutomatizacionCompleta.dyn` | Script principal de Dynamo (abrir con Dynamo for Civil 3D) |
| `civil3d_api_helper.py` | Módulo Python auxiliar con lógica detallada de la API Civil 3D |

---

## Requisitos previos en el modelo Civil 3D

Antes de ejecutar el script, el modelo `.dwg` debe contener:

1. **Superficie TN** — Superficie de terreno natural con el nombre exacto `TN`
2. **Polilínea eje** — Una sola Lwpolyline (o Polyline2d/3d) en la capa `EJE DE CAMINO`
3. **Rasante** — Perfil de rasante creado manualmente en el alineamiento (el script no la genera)
4. **Assembly "camino"** — Subassembly insertado en el modelo y visible en Toolspace

---

## Parámetros de entrada en Dynamo

| Nodo | Valor por defecto | Descripción |
|---|---|---|
| **Delta (metros)** | `0.30` | Decapado/desbroce. Rango: 0.00 – 0.60 m |
| **Capa Eje de Camino** | `EJE DE CAMINO` | Nombre exacto de la capa (con espacios y mayúsculas) |
| **Nombre Superficie TN** | `TN` | Nombre exacto de la superficie de terreno natural |
| **Nombre Superficie SELLO** | `SELLO` | Nombre de la nueva superficie de sello |
| **Nombre Alineamiento** | `ALI-EJE` | Nombre del alineamiento a crear |
| **Nombre Rasante (existente)** | `RASANTE` | Nombre del perfil de rasante ya existente en el modelo |
| **Nombre Assembly 'camino'** | `camino` | Nombre del assembly (verificar en Toolspace > Assemblies) |

---

## Flujo de ejecución

```
[Polilínea en "EJE DE CAMINO"]
         │
         ▼
    PASO 1: Alineamiento
    ┌─────────────────────────────────────────────────┐
    │ Busca Lwpolyline en capa "EJE DE CAMINO"        │
    │ Intenta CreateFromPolyline() (preserva arcos)   │
    │ Fallback: construcción manual segmento a segmento│
    └─────────────────────────────────────────────────┘
         │
         ▼
    PASO 2: Superficie SELLO = TN − delta
    ┌─────────────────────────────────────────────────┐
    │ Busca superficie TN por nombre                  │
    │ Crea nueva TinSurface "SELLO"                   │
    │ Aplica offset vertical = −delta m               │
    │ Fallback: copia de puntos TIN con offset Z      │
    └─────────────────────────────────────────────────┘
         │
         ▼
    PASO 3: Vista de Perfil Longitudinal
    ┌─────────────────────────────────────────────────┐
    │ Crea perfiles de superficie (TN y SELLO)        │
    │ Posiciona la vista a la derecha del alineamiento│
    │ Estilo "Standard" (tolerante a idioma)          │
    └─────────────────────────────────────────────────┘
         │
         ▼
    PASO 4: Corredor Vial
    ┌─────────────────────────────────────────────────┐
    │ Busca rasante por nombre en el alineamiento     │
    │ Busca assembly "camino" en el modelo            │
    │ Crea corredor en toda la longitud del eje       │
    │ Usa SELLO como superficie objetivo (target)     │
    └─────────────────────────────────────────────────┘
```

---

## Instrucciones de uso

1. Abrir Civil 3D 2026 con el `.dwg` que contiene los elementos previos
2. Ir a **Manage → Dynamo for Civil 3D**
3. Abrir el archivo `DisenoVial_AutomatizacionCompleta.dyn`
4. Verificar que el modo de ejecución sea **Manual** (no Automatic)
5. Ajustar los nodos de entrada según el modelo
6. Hacer clic en **Run**
7. Verificar los mensajes en el nodo **Watch: Resultado Final**

---

## Problemas frecuentes y soluciones

### Error: "Superficie 'TN' no encontrada"
- Verificar nombre exacto en el Toolspace de Civil 3D (puede tener espacios o mayúsculas diferentes)
- Ajustar el nodo de entrada **Nombre Superficie TN**

### Error: "Polilínea no encontrada en la capa 'EJE DE CAMINO'"
- Verificar que la capa se llame exactamente `EJE DE CAMINO` (con espacios)
- En Civil 3D español puede aparecer con caracteres especiales
- Usar el comando `LIST` en AutoCAD sobre la polilínea para ver el nombre exacto de la capa

### Error: "Assembly 'camino' no encontrado"
- Verificar nombre en **Toolspace → Assemblies**
- El assembly debe estar insertado en el espacio modelo, no solo en la paleta
- En Civil 3D español puede llamarse con acento: "Camino" o variantes

### Error: "Rasante no encontrada"
- El script lista los perfiles disponibles en el mensaje de error
- Copiar el nombre exacto al nodo de entrada **Nombre Rasante**

### Warning: "[WARN] CreateFromPolyline falló"
- Normal si la versión de Civil 3D no soporta ese método
- El script activa el fallback manual automáticamente
- Los arcos se reconstruyen desde los datos de bulge de la polilínea

### Superficie SELLO ya existe
- El script la elimina y recrea automáticamente con el nuevo delta
- Se puede deshabilitar este comportamiento comentando el bloque de eliminación

---

## Notas técnicas sobre geometría mixta

La polilínea en `EJE DE CAMINO` puede contener:
- **Segmentos rectos**: `bulge == 0` → se crean como `AlignmentLine`
- **Arcos**: `bulge != 0` → se decodifica el parámetro bulge para reconstruir `AlignmentArc`

La fórmula de conversión es:
```
ángulo_incluido = 4 × arctan(|bulge|)
radio = distancia_cuerda / (2 × sin(ángulo/2))
```

El método `Alignment.CreateFromPolyline()` (método principal) maneja esta conversión nativamente y es el más preciso. El método manual se activa solo como fallback.

---

## Compatibilidad de idioma Civil 3D

| Elemento | Civil 3D Inglés | Civil 3D Español |
|---|---|---|
| Estilo por defecto | `Standard` | `Estándar` |
| Sin sitio | `ObjectId.Null` | `ObjectId.Null` |
| Conjunto de etiquetas | `_No Labels` | `_Sin Etiquetas` (varía) |
| `DefinitionAddPastedSurface` | Disponible | Puede no estar disponible — fallback activo |

El script intenta múltiples nombres de estilo en orden de prioridad y usa el primero que encuentre.
