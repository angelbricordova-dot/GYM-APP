# Lindwyrm 💗

App web (PWA) privada para **dos personas**: entrenan juntos, anotan sus series con sobrecarga progresiva,
mantienen una **racha** (se activa con una foto del espejo al salir del gym), se ponen **retos** durante el día,
se mandan **notas de motivación** y ganan **puntos de amor** que canjean por premios que **ambos aprueban**.
Se instala en el iPhone como una app.

## Qué incluye

| Área | Detalle |
|---|---|
| **Entrenar** | Pestaña propia. Empezar en un toque: entreno libre, **repetir el último**, tus rutinas y plantillas (Empuje, Tirón, Pierna, Cuerpo completo). En el entreno: **solo ves la serie en la que estás**; al tocar ✓ aparece la siguiente **con el mismo registro** para subirle o bajarle con − / +. Temporizador de descanso, temporizador de descanso, el ejercicio completado se pliega, “anterior” por serie, meta automática (doble progresión) y detección de récords. Buscador de ejercicios por grupo muscular. |
| **Racha 🔥** | Se activa con la **foto del espejo**. Tolera descansos (por defecto 2 días sin ir) y tiene **pausa** por enfermedad o viaje. Muestra tu mejor racha. Hitos con bonus (3, 7, 14, 30, 60, 100 días). |
| **Progreso** | **Análisis del mes**: días que fuiste, días que faltaste (según tu meta semanal y desde que empezaste a usar la app), semanas cumplidas, comparación con el mes anterior, series, kg movidos y récords. Calendario, tendencia de 6 meses, galería de fotos, gráficas por ejercicio y peso corporal. |
| **Juntos** | **Retos**: uno le pone al otro “10 flexiones por 20 puntos”; quien lo recibe toca *Iniciar reto*, se **graba en la app** (o sube foto/video) y quien lo puso **revisa y aprueba** (o pide repetirlo). Al aprobar se suman los puntos. **Motivación**: tablero de notas con corazones. **Suplementos**: creatina y proteína por defecto, más los que agregues (multivitamínico, omega…); cada quien marca lo que se tomó hoy y la pareja lo ve, con la semana. **Perfil de tu pareja**: su racha, calendario, análisis y **todas las fotos que ha compartido** (*Ver todas*). |
| **Hoy no fui** | En *Hoy* → botón rojo “Hoy no fui al gym”: escribes la razón (o eliges una) y le llega a tu pareja como nota y notificación. **Tu pareja decide cuántos puntos de amor te quita (de 1 a 100)**; mientras no decida no resta. Si al final sí entrenas ese día, no pierdes nada; en pausa tampoco. |
| **Puntos de amor** | +10 por check-in con foto, +5 por récord, +20 por meta semanal, bonus por racha y los de los retos aprobados. Los premios **se proponen y el otro acepta, rechaza o contraoferta**. Los canjes generan un cupón. |
| **Rutinas compartidas** | En *Juntos → Rutinas* uno le **recomienda una rutina** al otro (de sus rutinas, de un entreno reciente o de una plantilla; solo van los ejercicios, series y repeticiones, no tus kilos). Quien la recibe la ve como *Recomendada*, la abre, **empieza ahora**, la guarda en sus rutinas o la descarta. |
| **Notificaciones push** | Retos, evidencias, aprobaciones, notas, corazones, rutinas recomendadas, premios y “tu pareja ya entrenó”. Cada tipo se puede apagar, y hay un **recordatorio diario** a la hora que elijas si aún no entrenaste. |
| **Perfil** | Foto de perfil (la **encuadras** antes de guardarla: arrastra y acerca con pellizco o el control), **color personal** (24 colores o cualquiera), tema **Automático / Día / Noche**, metas, pausa de racha, privacidad del peso (privado por defecto), notificaciones, PIN, **Google**, **Reiniciar de cero** y **Eliminar mi usuario** (ambos piden escribir una palabra para confirmar). |
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
   - `VAPID_SUBJECT` — opcional (`mailto:tu@correo.com`). Por defecto se usa la URL del sitio.
4. Abre la URL en el celular de la primera persona → **Crear nuestro espacio**. Te muestra un **enlace de invitación**
   (botón *Compartir enlace*). Tu pareja lo abre y llega a la pantalla **Únete** con el código ya escrito; después de crear su perfil
   le aparece una pregunta de amor y, para unirse, debe escribir **“acepto mi amor te amo mucho”**. Esa aceptación queda como la
   primera nota del tablero de motivación. Cuando se unen los dos, el espacio queda cerrado.
   - Los códigos no usan caracteres que se confundan (sin S/5, Z/2, B/8, O/0, I/1) y los códigos viejos también aceptan esas parejas.
   - 8 códigos incorrectos seguidos bloquean 10 minutos. El texto de la pregunta está en `app/js/ui/auth.js` y la frase en `PACT_PHRASE` (`app/js/logic.js`).
5. **iPhone**: abre la URL en **Safari** → Compartir → **Agregar a pantalla de inicio**.

> No hace falta ninguna cuenta externa para lo básico: los datos viven en Netlify Blobs del propio sitio.

### Entrar con Google (opcional)

Solo se necesita el **ID de cliente** (no hay “secreto”). Paso a paso:

1. Entra a [Google Cloud Console](https://console.cloud.google.com/) con tu cuenta de Google y crea un proyecto (arriba, selector de proyectos → *Proyecto nuevo* → nombre “Lindwyrm”).
2. **Pantalla de consentimiento**: *APIs y servicios → Pantalla de consentimiento de OAuth* (o *Google Auth Platform → Branding*). Tipo de usuario **Externo**, nombre de la app “Lindwyrm”, tu correo de asistencia y de contacto. Déjala en estado **Testing** (Prueba).
3. En **Usuarios de prueba** (*Público → Usuarios de prueba*) agrega **los dos correos de Google** que van a usar (el tuyo y el de Angélica). En modo Prueba solo esas cuentas pueden entrar, que es justo lo que quieren; no hace falta verificar la app.
4. **Credenciales**: *APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth* → tipo de aplicación **Aplicación web**.
5. En **Orígenes autorizados de JavaScript** agrega la URL exacta de tu sitio de Netlify, sin barra final (por ejemplo `https://lindwyrm.netlify.app`). Si luego usan un dominio propio, agrégalo también. Para pruebas locales: `http://localhost:8888`. No hace falta “URI de redireccionamiento”.
6. Copia el **ID de cliente** (termina en `.apps.googleusercontent.com`).
7. En Netlify → *Site configuration → Environment variables* crea `GOOGLE_CLIENT_ID` con ese valor y **vuelve a desplegar** (*Deploys → Trigger deploy*).
8. Listo: aparece **Continuar con Google** al crear/unirse/entrar. Quien ya tiene cuenta con PIN la vincula en *Perfil → Cuenta* o, más fácil, toca *Acceder con Google* en la pantalla de entrar: si aún no está vinculado, pide nombre y PIN una vez y lo vincula.

> ⚠️ Google en una app instalada en la pantalla de inicio del iPhone puede abrir su ventana de forma distinta a Safari. Pruébalo en el teléfono real;
> por eso siempre puedes crear un **PIN** en el perfil como respaldo.

## Notificaciones push

No necesitas configurar nada: las llaves (VAPID) se generan solas la primera vez y se guardan en el servidor.

- **Android / computadora**: *Perfil → Notificaciones → En este teléfono* y aceptar el permiso.
- **iPhone**: solo funcionan con la app **instalada en la pantalla de inicio** (Safari → Compartir → Agregar a pantalla de inicio), abierta desde su icono, con **iOS 16.4 o más reciente**. Después activa el interruptor en *Perfil → Notificaciones*. Hay un botón para mandarte una notificación de prueba.
- El **recordatorio diario** lo manda una función programada de Netlify (`netlify/functions/reminders.mjs`, cada hora). Corre solo en el sitio publicado, no en `npm run dev`.
- Si cambias el dominio del sitio, desactiva y vuelve a activar las notificaciones en cada teléfono.

## Desvincularse y cambiar de pareja

- **Perfil → Pareja → Desvincularme**: cualquiera de los dos puede salir (pide escribir DESVINCULAR). Cada quien **se queda con su cuenta, su progreso, sus fotos, su racha y los puntos de amor ya ganados** (los de retos y penalizaciones quedan fijados). Se borra lo compartido: notas del tablero, retos, premios y rutinas. Quien se queda recibe un **código nuevo** (el viejo ya no sirve) y quien sale recibe el suyo.
- Quien se desvinculó puede **invitar a otra persona** con su enlace nuevo, o **unirse al espacio de otra persona** con el código que le mande (*Hoy* → “Tengo el código de otra persona”, o *Perfil → Pareja*). Pide la misma frase de aceptación.
- Cada pareja es un **espacio** aparte: nadie ve las fotos, notas ni retos de otras parejas. Una persona nueva puede crear su cuenta y su espacio solo si das el `SETUP_CODE` (sin esa variable en Netlify, el sitio solo permite el primer espacio). Los nombres no se pueden repetir entre personas, porque sirven para entrar.

## ¿Olvidaste tu nombre o tu PIN?

En la pantalla de entrar toca **Olvidé mi nombre o mi PIN**. Pide el `SETUP_CODE` de Netlify (por eso conviene tenerlo definido: sin él **no hay recuperación**, para que nadie con la URL pueda apoderarse del espacio). Con el código ves los nombres de las dos personas, eliges quién eres y pones un **PIN nuevo**; también existe *Borrar todo y empezar de cero* (pide escribir BORRAR). Cinco fallos seguidos con el código bloquean 10 minutos. El nombre al entrar ya no distingue mayúsculas ni acentos (“angel” = “Ángel”).

## Reiniciar y eliminar

- **Reiniciar de cero** (*Perfil → Zona de peligro*): borra tus entrenos, check-ins, fotos, peso, puntos de amor, rutinas y pausas. Conserva tu cuenta, ajustes, foto y color; tu pareja no pierde nada. Los retos que te habían puesto y seguían pendientes se cancelan, y los puntos de retos anteriores no vuelven.
- **Eliminar mi usuario**: borra la cuenta y todo lo que creaste. Tu pareja se queda con el espacio y un código de invitación nuevo; si eras la última persona, el espacio queda libre para crearse de nuevo.

## Desarrollo local

```bash
npm install
npm run dev     # http://localhost:8888 (datos en .localdb/, ignorado por git)
npm test        # API, push (simulado), lógica y contraste de colores
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
- Las notificaciones push no se pueden probar en `npm run dev` con servicios reales de Apple/Google: se probaron con un envío simulado. Pruébalas en el sitio publicado.
- iOS no permite vibración desde la web.

## Notas técnicas

Por compatibilidad con datos ya guardados, algunas claves internas conservan el nombre anterior (`gymduo.v2` en el teléfono, `gymduo` en Netlify Blobs).
