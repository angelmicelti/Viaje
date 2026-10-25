# Protección y aislamiento de los datos de Viaje (Firebase)

La base de datos `arduinoblocks01` está **compartida por varias aplicaciones** y hasta ahora
estaba completamente abierta: cualquier persona en internet podía **leer y modificar** todos los
datos (los viajes y también los datos de las otras apps). Esta guía cierra el acceso al nodo de
esta app (**`viajePlanner`**, que contiene todos los viajes creados) sin tocar la configuración
del resto de apps.

## Paso 0 — Actualizar la app (ya hecho)

`Viaje2026-Configurable.html` ahora inicia sesión en Firebase con **autenticación anónima**
antes de cargar los datos. Si el proveedor anónimo aún no está activo, la app sigue funcionando
con las reglas actuales y mostrará un aviso si en algún momento se queda sin permiso.

## Paso 1 — Activar el proveedor anónimo

1. Consola de Firebase → proyecto **arduinoblocks01** → **Authentication** → **Sign-in method**.
2. Pulsa **Anónimo (Anonymous)** → **Habilitar** → Guardar.

(Solo permite sesiones anónimas de este proyecto; nadie puede crear cuentas con correo ni contraseña.)

## Paso 2 — Publicar las reglas (protegen SOLO el nodo `viajePlanner`)

1. Consola → **Realtime Database** → pestaña **Reglas**.
2. **NO borres las reglas existentes** (las otras apps las necesitan). Añade el bloque
   `viajePlanner` dentro de `"rules"`, junto a las demás claves. Ejemplo con la configuración
   abierta habitual:

```json
{
  "rules": {
    "...tus reglas actuales para otras apps...": {},

    "viajePlanner": {
      ".read": "auth != null",
      ".write": "auth != null",
      "activeTripId": {
        ".validate": "newData.isString()"
      },
      "trips": {
        "$tripId": {
          ".validate": "newData.hasChildren(['id', 'data'])",
          "id":        { ".validate": "newData.isString()" },
          "createdAt": { ".validate": "newData.isString()" },
          "startDate": { ".validate": "newData.isString()" },
          "endDate":   { ".validate": "newData.isString()" },
          "source":    { ".validate": "newData.isString()" },
          "data": {
            ".validate": "newData.hasChildren(['config', 'locations', 'accommodations', 'reservations', 'travelPlan'])"
          }
        }
      }
    }
  }
}
```

3. Publica (**Publish**).

Qué consiguen estas reglas:
- **`.read` / `.write` = `auth != null`**: solo clientes autenticados de este proyecto (la app
  inicia sesión anónima automáticamente) pueden leer o escribir los viajes. Nadie sin
  autenticar (por ejemplo, alguien con la URL) puede acceder.
- **`.validate`**: aunque alguien autenticado intente escribir basura, solo se acepta la
  estructura de datos correcta de esta app.

Las reglas más profundas **prevalecen** sobre las del nivel superior, así que aunque la raíz
siga abierta para las otras apps, `viajePlanner` queda cerrado.

## Paso 3 — Comprobar que funciona

1. Abre la app: los viajes deben cargar con normalidad (revisa que no aparezca el aviso
   «⚠ Sin permiso para leer los datos»).
2. Verifica desde fuera que está cerrada (debe responder *Permission Denied*):

```bash
curl "https://arduinoblocks01-default-rtdb.europe-west1.firebasedatabase.app/viajePlanner.json?shallow=true"
```

## Recomendaciones adicionales (opcionales)

- **Cerrar también el resto de la base de datos**: hoy las otras apps (`appState`,
  `additionalCriteriaPerPractice`…) también son públicas. Si ninguna usa autenticación,
  añadir a su vez `".read"/".write": "auth != null"` en la raíz puede romperlas: hazlo app por
  app, con sus clientes actualizados.
- **Aislamiento fuerte por aplicación (App Check)**: `auth != null` separa esta app de
  intrusos sin sesión, pero cualquier cliente del mismo proyecto con sesión podría en teoría
  tocar el nodo. Si se quiere que SOLO esta web pueda escribir (ni siquiera otros clientes del
  proyecto), la solución es Firebase **App Check** (reCAPTCHA Enterprise/v3): requiere registro
  en consola y un pequeño cambio de código; pídelo y se implementa.
- Las claves `apiKey`/`appId` visibles en el HTML **no son secretas** (así funciona Firebase en
  web): la protección real son estas reglas.
