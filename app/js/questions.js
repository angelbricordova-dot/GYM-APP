// Preguntas en pareja: cada día sale una nueva (la elige el servidor y es la misma para los dos). Hay de todo: para conocerse, recuerdos, futuro, diversión, romance, intimidad emocional y picantes.
// Tipos: 'open' (respuesta escrita), 'choice' (opciones) y 'scale' (del 1 al 5). Siempre se puede elegir “Prefiero no responder”.

export const CATEGORIES = {
  conocernos: { emoji: '🔎', label: 'Conocernos' },
  recuerdos: { emoji: '📸', label: 'Recuerdos' },
  futuro: { emoji: '🌅', label: 'Futuro' },
  divertidas: { emoji: '🎲', label: 'Divertidas' },
  romance: { emoji: '💞', label: 'Romance' },
  intimidad: { emoji: '🫶', label: 'Cercanía' },
  picante: { emoji: '🔥', label: 'Picante' },
};

/** Orden de categorías por día (el día del año módulo 7): 3 de cada 7 días son picantes. */
export const ROTATION = ['picante', 'conocernos', 'romance', 'picante', 'futuro', 'divertidas', 'picante', 'intimidad', 'recuerdos', 'picante', 'divertidas', 'romance', 'conocernos', 'picante'];

const o = (cat, text) => ({ cat, type: 'open', text });
const c = (cat, text, options) => ({ cat, type: 'choice', text, options });
const s = (cat, text, low, high) => ({ cat, type: 'scale', text, low, high });

const RAW = [
  // ---- conocernos
  o('conocernos', '¿Qué es algo que casi nadie sabe de ti y que me quisieras contar?'),
  o('conocernos', '¿Cuál es tu mayor miedo y cómo te puedo ayudar con él?'),
  o('conocernos', '¿Qué cosa pequeña del día a día te hace feliz sin falta?'),
  c('conocernos', '¿Cómo recargas energía después de un día pesado?', ['Solo/a y en silencio', 'Con mi pareja', 'Con amigos o familia', 'Haciendo ejercicio', 'Durmiendo']),
  o('conocernos', '¿Qué canción te describe en este momento de tu vida?'),
  o('conocernos', '¿Qué es lo que más admiras de mí?'),
  o('conocernos', '¿Cuál fue el mejor consejo que te han dado?'),
  c('conocernos', '¿Eres más de mañanas o de noches?', ['Mañanas', 'Noches', 'Depende del día']),
  o('conocernos', '¿Qué hábito tuyo te gustaría cambiar?'),
  o('conocernos', '¿Cuál es tu recuerdo de infancia favorito?'),
  s('conocernos', '¿Qué tan bien crees que me conoces?', 'Poco', 'Muchísimo'),
  o('conocernos', '¿Qué te hace sentir más orgulloso/a de ti últimamente?'),
  o('conocernos', '¿Qué es algo que nunca te he preguntado y te gustaría que te preguntara?'),
  c('conocernos', '¿Cuál es tu lenguaje del amor principal?', ['Palabras de afecto', 'Tiempo de calidad', 'Regalos', 'Actos de servicio', 'Contacto físico']),
  o('conocernos', 'Si tuvieras un día libre sin obligaciones, ¿qué harías?'),
  o('conocernos', '¿Qué te da más tranquilidad cuando estás ansioso/a?'),
  o('conocernos', '¿Qué cosa te cuesta pedir ayuda?'),
  o('conocernos', '¿Qué parte de tu rutina de gym disfrutas más y por qué?'),
  s('conocernos', '¿Qué tan cómodo/a te sientes mostrándome cuando estás vulnerable?', 'Poco', 'Muy cómodo/a'),
  o('conocernos', '¿Qué te gustaría que supiera de cómo te sientes hoy?'),
  // ---- recuerdos
  o('recuerdos', '¿Cuál fue tu primera impresión de mí?'),
  o('recuerdos', '¿En qué momento supiste que yo te gustaba de verdad?'),
  o('recuerdos', '¿Cuál ha sido tu momento favorito que hemos vivido juntos?'),
  o('recuerdos', '¿Qué recuerdo nuestro te hace sonreír cada vez que lo piensas?'),
  o('recuerdos', '¿Cuál fue nuestra mejor cita hasta ahora?'),
  o('recuerdos', '¿Qué lugar al que hemos ido quieres volver a visitar?'),
  o('recuerdos', '¿Qué es lo más gracioso que nos ha pasado juntos?'),
  o('recuerdos', '¿Qué detalle mío te sorprendió y no esperabas?'),
  o('recuerdos', '¿Cuál fue la primera vez que sentiste que me querías?'),
  o('recuerdos', '¿Qué foto nuestra es tu favorita y por qué?'),
  o('recuerdos', '¿Qué momento difícil superamos que nos hizo más fuertes?'),
  o('recuerdos', '¿Qué es lo primero que pensaste cuando nos besamos por primera vez?'),
  // ---- futuro
  o('futuro', '¿Cómo te imaginas nuestra vida dentro de cinco años?'),
  o('futuro', '¿Qué viaje sueñas hacer conmigo?'),
  o('futuro', '¿Qué meta te gustaría que cumpliéramos juntos este año?'),
  c('futuro', '¿Dónde te gustaría vivir algún día?', ['En la ciudad', 'Cerca del mar', 'En el campo o la montaña', 'En otro país', 'Donde tú estés']),
  o('futuro', '¿Qué tradición nos gustaría crear como pareja?'),
  o('futuro', '¿Cómo sería para ti nuestro hogar ideal?'),
  s('futuro', '¿Qué tan emocionado/a estás por nuestro futuro?', 'Con dudas', 'Muy emocionado/a'),
  o('futuro', '¿Qué cosa te gustaría aprender a hacer juntos?'),
  o('futuro', '¿Qué sueño personal tuyo quieres que te ayude a cumplir?'),
  o('futuro', '¿Cómo te gustaría que celebráramos nuestro próximo aniversario?'),
  o('futuro', '¿Qué reto físico te gustaría que hiciéramos juntos (una carrera, una caminata, un reto de gym)?'),
  // ---- divertidas
  c('divertidas', 'Si fuéramos un dúo de superhéroes, ¿cuál sería nuestro poder?', ['Teletransportarnos juntos', 'Leernos la mente', 'Fuerza sobrehumana', 'Volar', 'Detener el tiempo']),
  o('divertidas', 'Si solo pudieras comer una cosa el resto de tu vida, ¿qué sería?'),
  c('divertidas', '¿Quién cocina mejor?', ['Yo', 'Mi pareja', 'Ninguno, pedimos delivery']),
  o('divertidas', '¿Qué película o serie podríamos ver mil veces sin aburrirnos?'),
  c('divertidas', '¿Plan perfecto de domingo?', ['Maratón de series', 'Salir a caminar', 'Cocinar juntos', 'Dormir todo el día', 'Algo de aventura']),
  o('divertidas', 'Si ganáramos la lotería hoy, ¿qué es lo primero que haríamos?'),
  o('divertidas', '¿Cuál es tu manía más rara que yo ya descubrí?'),
  c('divertidas', '¿Quién se duerme primero?', ['Yo', 'Mi pareja', 'Depende del día']),
  o('divertidas', 'Descríbeme con tres emojis.'),
  o('divertidas', '¿Qué apodo cariñoso nuevo me pondrías?'),
  o('divertidas', 'Si hiciéramos una película de nuestra historia, ¿qué actores nos harían y cómo se llamaría?'),
  c('divertidas', '¿Qué prefieres para una cita en casa?', ['Pizza y película', 'Cena a la luz de las velas', 'Juegos de mesa', 'Videojuegos', 'Spa casero']),
  o('divertidas', '¿Cuál es el mejor ejercicio del gym para entrenar juntos y el peor para hacerme sufrir? 😂'),
  // ---- romance
  o('romance', '¿Qué detalle romántico te haría muy feliz recibir esta semana?'),
  o('romance', 'Escríbeme tres cosas que amas de mí.'),
  c('romance', '¿Qué cita te gustaría más?', ['Cena romántica', 'Picnic', 'Paseo al atardecer', 'Escapada de fin de semana', 'Noche de películas con cobija']),
  o('romance', '¿Qué hago que te hace sentir más querido/a?'),
  o('romance', '¿Cuál es la forma en la que más te gusta que te diga “te quiero”?'),
  s('romance', '¿Qué tan seguido te gustaría que tuviéramos citas solo nosotros dos?', 'Pocas', 'Muy seguido'),
  o('romance', 'Si pudieras repetir un día perfecto conmigo, ¿cómo sería?'),
  o('romance', '¿Qué canción nos pondrías de fondo para un baile lento?'),
  o('romance', '¿Qué gesto de amor sin palabras te gustaría que hiciera más?'),
  c('romance', '¿Cómo te gusta más que te despierte?', ['Con un beso', 'Con un mensaje bonito', 'Con el desayuno listo', 'Con un abrazo largo', 'Que me dejes dormir 😅']),
  o('romance', 'Escribe una frase que describa lo que sientes por mí hoy.'),
  o('romance', '¿Qué carta o nota de amor te gustaría recibir algún día?'),
  // ---- intimidad (cercanía emocional)
  o('intimidad', '¿Cuándo te sientes más cerca de mí?'),
  o('intimidad', '¿Qué necesitas de mí cuando estás pasando un mal momento?'),
  o('intimidad', '¿Hay algo que quieras decirme y no has encontrado el momento?'),
  s('intimidad', '¿Qué tan escuchado/a te sientes cuando hablamos?', 'Poco', 'Totalmente'),
  o('intimidad', '¿Qué podemos hacer para sentirnos más conectados en la semana?'),
  o('intimidad', '¿Qué es lo que más te cuesta decirme y por qué?'),
  o('intimidad', '¿Cómo te gustaría que resolviéramos nuestras discusiones?'),
  c('intimidad', 'Cuando discutimos, ¿qué necesitas primero?', ['Espacio un rato', 'Hablarlo en el momento', 'Un abrazo', 'Que me escuchen sin interrumpir']),
  o('intimidad', '¿Qué agradeces de nuestra relación hoy?'),
  o('intimidad', '¿En qué momento me has sentido más tuyo/a?'),
  s('intimidad', '¿Qué tan seguro/a te sientes de lo que tenemos?', 'Con dudas', 'Totalmente'),
  o('intimidad', '¿Qué nos falta hacer para cuidar más la relación?'),
  // ---- picante (para adultos que se quieren: respeto, consentimiento y confianza; siempre se puede no responder)
  o('picante', '¿Qué es lo que más te excita de mí? 🔥'),
  o('picante', '¿Qué parte de mi cuerpo te encanta más y cómo te gusta que te lo demuestre?'),
  s('picante', 'Del 1 al 5, ¿qué tantas ganas tienes de pasar un rato íntimo conmigo hoy?', 'Hoy no', 'Muchísimas'),
  o('picante', '¿Cuál ha sido tu mejor momento íntimo conmigo?'),
  o('picante', '¿Qué te gustaría que hiciera más en la intimidad?'),
  o('picante', '¿Qué fantasía te da un poco de pena contarme?'),
  o('picante', '¿Hay algo que te gustaría probar y todavía no te has atrevido a pedirme?'),
  c('picante', 'En la intimidad, ¿tú qué prefieres?', ['Llevar el control', 'Que me lleven', 'Alternar', 'Depende del ánimo']),
  c('picante', '¿A qué hora te gusta más estar juntos?', ['Mañana', 'Tarde', 'Noche', 'Madrugada', 'A cualquier hora']),
  c('picante', '¿Con qué empezarías una noche especial?', ['Besos lentos', 'Un masaje', 'Un baño o ducha juntos', 'Un mensaje coqueto desde antes', 'Una sorpresa']),
  o('picante', '¿Qué te gustaría que te susurrara al oído?'),
  o('picante', '¿Cuál es tu zona favorita para que te besen o te acaricien?'),
  s('picante', '¿Qué tan importante es para ti el juego previo?', 'Poco', 'Muy importante'),
  c('picante', '¿Qué te gustaría más esta semana?', ['Una cita sensual planeada', 'Un masaje con aceites', 'Una noche sin celulares', 'Algo improvisado', 'Un baño juntos']),
  o('picante', '¿Qué lugar de la casa tiene más potencial para una noche atrevida? 😏'),
  o('picante', '¿Qué atuendo mío te encanta o te gustaría verme usar?'),
  o('picante', 'Describe en tres palabras cómo fue nuestra última vez.'),
  o('picante', '¿Te gustaría probar un juego de roles? ¿Cuál?'),
  s('picante', '¿Qué tan a gusto te sientes pidiéndome lo que quieres en la intimidad?', 'Me cuesta', 'Muy a gusto'),
  o('picante', '¿Qué es algo que NO te gusta o no quieres en la intimidad? (así lo cuidamos)'),
  o('picante', '¿Qué hago que te hace sentir más sexy y deseado/a?'),
  c('picante', '¿Cada cuánto te gustaría que tuviéramos intimidad?', ['Casi todos los días', 'Varias veces por semana', 'Una vez por semana', 'Cuando se dé, sin presión']),
  o('picante', '¿Cuál fue tu primer pensamiento picante sobre mí?'),
  o('picante', '¿Alguna vez soñaste algo sensual conmigo? Cuéntame (sin censura).'),
  o('picante', '¿Qué te gustaría que planeáramos para una noche solo de nosotros, sin prisa?'),
  c('picante', 'Un beso largo, una caricia lenta o un abrazo fuerte: ¿qué te enciende más?', ['Un beso largo', 'Una caricia lenta', 'Un abrazo fuerte', 'Las tres 😏']),
  o('picante', '¿Con qué fantasía te gustaría sorprenderme?'),
  o('picante', '¿Qué cosa que hago te prende sin que yo me dé cuenta?'),
  s('picante', '¿Qué tan aventurero/a te sientes para probar algo nuevo juntos?', 'Prefiero lo de siempre', 'Con ganas de todo'),
  o('picante', 'Si hoy tuviéramos la casa solos y todo el tiempo del mundo, ¿qué harías conmigo?'),
  o('picante', '¿Qué te gustaría que me pusiera o que hiciera después de entrenar juntos? 😉'),
  o('picante', '¿Qué canción pondrías para una noche íntima?'),
  c('picante', '¿Qué es más sensual para ti?', ['Una mirada intensa', 'Una voz grave al oído', 'Un roce sutil', 'Ropa que se queda en la imaginación']),
  o('picante', '¿Qué parte de nuestra intimidad quisieras que cuidáramos o mejoráramos?'),
];

export const QUESTIONS = RAW.map((q, i) => ({ id: `${q.cat}-${String(i + 1).padStart(3, '0')}`, ...q }));
const BY_ID = new Map(QUESTIONS.map((q) => [q.id, q]));
export const questionById = (id) => BY_ID.get(id) || null;

/** Qué se guarda de una respuesta según el tipo (y se valida). Devuelve null si no es válida. */
export function cleanAnswer(q, value) {
  if (q.type === 'open') { const t = String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 400); return t || null; }
  if (q.type === 'choice') { const i = Number(value); return Number.isInteger(i) && i >= 0 && i < q.options.length ? i : null; }
  if (q.type === 'scale') { const n = Number(value); return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null; }
  return null;
}
/** La respuesta en texto legible. */
export function answerText(q, value) {
  if (q.type === 'choice') return q.options[value] ?? '';
  if (q.type === 'scale') return `${value}/5`;
  return String(value ?? '');
}
