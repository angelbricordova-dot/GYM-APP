# Lindwyrm 💗

App web (PWA) privada para **dos personas**: entrenan juntos, anotan sus series con sobrecarga progresiva,
mantienen una **racha** (se activa con una foto del espejo al salir del gym), se ponen **retos** durante el día,
se mandan **notas de motivación** y ganan **puntos de amor** que canjean por premios que **ambos aprueban**.
Se instala en el iPhone como una app.

## Qué incluye

| Área | Detalle |
|---|---|
| **Entrenar** | Pestaña propia. Empezar en un toque: entreno libre, **repetir el último**, tus rutinas y plantillas (Empuje, Tirón, Pierna, Cuerpo completo). En el entreno: botones − / +, ✓ por serie, temporizador de descanso, el ejercicio completado se pliega, “anterior” por serie, meta automática (doble progresión) y detección de récords. Buscador de ejercicios por grupo muscular. |
| **Racha 🔥** | Se activa con la **foto del espejo**. Tolera descansos (por defecto 2 días sin ir) y tiene **pausa** por enfermedad o viaje. Muestra tu mejor racha. Hitos con bonus (3, 7, 14, 30, 60, 100 días). |
| **Progreso** | **Análisis del mes**: días que fuiste, días que faltaste (según tu meta semanal y desde que empezaste a usar la app), semanas cumplidas, comparación con el mes anterior, series, kg movidos y récords. Calendario, tendencia de 6 meses, galería de fotos, gráficas por ejercicio y peso corporal. |
| **Juntos** | **Retos**: uno le pone al otro “10 flexiones por 20 puntos”; quien lo recibe toca *Iniciar reto*, se **graba en la app** (o sube foto/video) y quien lo puso **revisa y aprueba** (o pide repetirlo). Al aprobar se suman los puntos. **Motivación**: tablero de notas con corazones. **Perfil de tu pareja**: su racha, calendario, fotos y análisis. |
| **Puntos de amor** | +10 por check-in con foto, +5 por récord, +20 por meta semanal, bonus por racha y los de los retos aprobados. Los premios **se proponen y el otro acepta, rechaza o contraoferta**. Los canjes generan un cupón. |
| **Perfil** | Foto de perfil, **color personal** (24 colores o cualquiera), tema **Automático / Día / Noche**, metas, pausa de racha, privacidad del peso (privado por defecto), PIN, **Google**. |
| **Sin señal** | El check-in funciona sin internet: se guarda en el teléfono y se sincroniza (fotos incluidas) al volver la señal. Los retos y premios sí necesitan conexión. |

## Estructura

```
netlify.toml              publica app/ y la función de la API
netlify/functions/api.mjs punto de entrada de la API (Netlify Functions v2)
server/handler.mjs        API: cuenta (PIN y Google), sincronización, fotos, retos y evidencias, premios, notas
server/storage.mjs        Netlify Blobs en producción · archivos locales en pruebas
app/                      la app (HTML/CSS/JS sin build; Preact vendorizado en app/vendor)
  js/logic.js             rachas, puntos, análisis mensual, sobrecarga progresiva, color (lógica pura, con pruebas)
  js/store.js             estado local + sincronización
  js/theme.js             tema día/noche y color de acento
  js/ui/*.js              pantallas y componentes
tests/                    API, lógica y diseño (node --test)
tools/dev-server.mjs      servidor local con la misma API
tools/make-icons.mjs      genera los iconos
```

## Publicar en Netlify

1. **Add new site → Import an existing project → GitHub** y elige este repo (la rama a publicar).
2. Netlify lee `netlify.toml`. No hace falta comando de build: instala `@netlify/blobs` y publica `app/`.
3. **Variables de entorno** (*Site configuration → Environment variables*):
   - `SETUP_CODE` — **recomendado**: una palabra secreta. Sin ella, cualquiera que encuentre la URL antes que ustedes podría crear el espacio.
   - `GOOGLE_CLIENT_ID` — solo si quieren entrar con Google (ver abajo).
4. Abre la URL en el celular de la primera persona → **Crear nuestro espacio**. Te muestra un **código de invitación**;
   tu pareja abre la misma URL → **Unirme con código**. Cuando se unen los dos, el espacio queda cerrado.
5. **iPhone**: abre la URL en **Safari** → Compartir → **Agregar a pantalla de inicio**.

> No hace falta ninguna cuenta externa para lo básico: los datos viven en Netlify Blobs del propio sitio.

### Entrar con Google (opcional)

1. En [Google Cloud Console](https://console.cloud.google.com/) → *APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth* → tipo **Aplicación web**.
2. En **Orígenes autorizados de JavaScript** agrega la URL de tu sitio de Netlify (por ejemplo `https://lindwyrm.netlify.app`).
3. Copia el ID de cliente en la variable `GOOGLE_CLIENT_ID` de Netlify y vuelve a desplegar.
4. Aparece el botón **Continuar con Google** al crear/unirse/entrar, y en *Perfil → Cuenta* para vincular una cuenta existente.

> ⚠️ Google en una app instalada en la pantalla de inicio del iPhone puede abrir su ventana de forma distinta a Safari. Pruébalo en el teléfono real;
> por eso siempre puedes crear un **PIN** en el perfil como respaldo.

## Desarrollo local

```bash
npm install
npm run dev     # http://localhost:8888 (datos en .localdb/, ignorado por git)
npm test        # API, lógica y contraste de colores
```

## Diseño

Sigue la Guía de Interfaz de Apple (HIG): tipografía del sistema con texto base de 17 pt, listas agrupadas, pestañas solo para navegar (cinco, una palabra cada una),
paneles que se arrastran para cerrar, botones de ≥ 44 pt, movimiento breve y respetando *reducir movimiento*. Un solo color de acento por persona.
Los colores de ambos temas pasan una prueba automática de contraste 4.5:1 (`tests/design.test.mjs`).

## Seguridad y privacidad

- PIN con `scrypt`; sesión firmada (HMAC) de 180 días; bloqueo de 5 min tras 5 PIN incorrectos. Google se verifica en el servidor (firma RS256, `aud`, `iss`, `exp`).
- Cada persona solo escribe su propio documento; fotos y evidencias solo las ve quien tenga sesión.
- El **peso corporal es privado** salvo que lo compartas en Perfil.
- Es un proyecto personal: usa un `SETUP_CODE` y no compartas la URL.

## Límites actuales

- Las evidencias de los retos pesan máx. 5 MB (el video se graba comprimido, hasta 20 s). Un video grabado en Android (WebM) puede no reproducirse en un iPhone antiguo.
- Si usas tu cuenta en dos teléfonos a la vez, gana el cambio más reciente.
- Sin notificaciones push todavía (retos, notas y recordatorios): siguiente paso.
- iOS no permite vibración desde la web.

## Notas técnicas

Por compatibilidad con datos ya guardados, algunas claves internas conservan el nombre anterior (`gymduo.v2` en el teléfono, `gymduo` en Netlify Blobs).
