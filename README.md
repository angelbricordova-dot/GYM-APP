# Gym Duo 🔥

App web (PWA) privada para **dos personas**: entrenan, anotan sus series con sobrecarga progresiva, toman agua,
mantienen una **racha** (activada con una foto del espejo al salir del gym) y ganan **tokens** que canjean por
premios que **ambos aprueban**. Se instala en el iPhone como una app.

## Qué incluye

| Área | Detalle |
|---|---|
| **Racha 🔥** | Se activa al terminar con la **foto del espejo**. Tolera descansos (por defecto 2 días sin ir) y tiene **pausa** por enfermedad o viaje. Muestra tu mejor racha, nunca solo “perdiste todo”. Hitos con bonus (3, 7, 14, 30, 60, 100 días). |
| **Calendario** | Cada quien ve su calendario y el de su pareja (solo lectura): racha, fotos, entrenos del día y reacciones 🔥💪👏😍. |
| **Entreno en vivo** | Pensado para una mano: botones − / +, ✓ por serie, temporizador de descanso, “anterior” por serie, rutinas guardadas, “repetir el último”. Meta automática de la próxima vez (doble progresión) y detección de récords. |
| **Pareja** | Su perfil, racha de pareja (semanas en que ambos cumplen), galería de fotos, mensajes y ánimos rápidos. |
| **Agua** | Meta diaria editable con botones rápidos. |
| **Tokens y premios** | +10 por check-in con foto, +5 agua, +5 récord, +20 meta semanal y bonus por hitos de racha. Los premios **se proponen y el otro acepta, rechaza o contraoferta** el costo. Los canjes generan un cupón que cualquiera marca como “hecho”. |
| **Perfil** | Foto de perfil, color personal, metas, pausa de racha, privacidad del peso (privado por defecto), respaldo. |
| **Sin señal** | Funciona sin internet: todo se guarda en el teléfono y se sincroniza (incluidas las fotos) al volver la señal. |

## Estructura

```
netlify.toml              publica app/ y la función de la API
netlify/functions/api.mjs punto de entrada de la API (Netlify Functions v2)
server/handler.mjs        API: cuenta, sincronización, fotos, propuestas, cupones, mensajes
server/storage.mjs        Netlify Blobs en producción · archivos locales en pruebas
app/                      la app (HTML/CSS/JS sin build; Preact vendorizado en app/vendor)
  js/logic.js             rachas, tokens, sobrecarga progresiva (lógica pura, con pruebas)
  js/store.js             estado local + sincronización
  js/photos.js            fotos en IndexedDB y subida diferida
  js/ui/*.js              pantallas y componentes
tests/                    pruebas de la API y de la lógica (node --test)
tools/dev-server.mjs      servidor local con la misma API
tools/make-icons.mjs      genera los iconos
```

## Publicar en Netlify

1. **Add new site → Import an existing project → GitHub** y elige este repo (rama a publicar).
2. Netlify lee `netlify.toml`. No hace falta comando de build: instala `@netlify/blobs` y publica `app/`.
3. **Recomendado**: en *Site configuration → Environment variables* crea `SETUP_CODE` con una palabra secreta.
   Sin ella, cualquiera que encuentre la URL antes que ustedes podría crear el espacio.
4. Abre la URL en el celular de la primera persona → **Crear nuestro espacio** (nombre + PIN de 4 a 8 números).
   Te muestra un **código de invitación**; tu pareja abre la misma URL → **Unirme con código**.
   Cuando se unen los dos, el espacio queda cerrado (máximo 2 personas).
5. **iPhone**: abre la URL en **Safari** → Compartir → **Agregar a pantalla de inicio**.

> No hace falta ninguna cuenta externa (ni Firebase, ni Supabase): los datos viven en Netlify Blobs del propio sitio.

## Desarrollo local

```bash
npm install
npm run dev     # http://localhost:8888 (datos en .localdb/, ignorado por git)
npm test        # API + lógica
```

## Seguridad y privacidad

- PIN con `scrypt`; sesión firmada (HMAC) de 180 días; bloqueo de 5 min tras 5 PIN incorrectos.
- Cada persona solo escribe su propio documento; las fotos solo las ve quien tenga sesión.
- El **peso corporal es privado** salvo que lo compartas en Perfil.
- Es un proyecto personal: el PIN es corto a propósito. Usa un `SETUP_CODE` y no compartas la URL.

## Límites actuales

- Si usas tu cuenta en dos teléfonos a la vez, gana el cambio más reciente.
- Sin notificaciones push todavía (recordatorios de agua/gym y avisos de pareja): siguiente paso.
- iOS no permite vibración desde la web; el temporizador avisa visualmente.

## Lecciones de otras apps (y cómo las evitamos)

- **Rachas que castigan** (Apple Fitness no tiene descansos): aquí hay margen de descanso, pausa y “mejor racha”.
- **Fallos de sincronización / pantalla negra** (reseñas de Hevy): local primero; la red nunca bloquea registrar.
- **Paywalls y suscripciones** (Fitbod): sin cuentas de pago ni funciones ocultas.
- **Anotar es lento entre series**: steppers grandes, valores precargados con la meta, rutinas de un toque.
- **Apps de pareja con foto** (Workout Crew, Sweatmates): adoptamos la foto como prueba y la racha compartida.
