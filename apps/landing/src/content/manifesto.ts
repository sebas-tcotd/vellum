import type { Lang } from './routes';

/**
 * The manifesto (EXPERIENCE.md · Páginas · Manifiesto). The Spanish letter
 * is Sebas's text, literal (`.working/manifesto-final.md`, without its
 * [VISUAL] / [MARGEN] marks, which become the visual moments and the margin
 * notes). The English letter is a translation draft that keeps the rhythm —
 * short lines, the pauses in place, the same signature — for Sebas to
 * review. The letter syntax is in `src/lib/letter.ts`; margin notes accept
 * `{github|label}` and `{issues|label}` links.
 */
export interface ManifestoCopy {
  meta: { title: string; description: string };
  eyebrow: string;
  letter: string;
  /** Caption under the full-bleed map (no text on it). */
  bleedCaption: string;
  strip: {
    label: string;
    /** «Los Santos Pobres · 05» */
    caption: (label: string) => string;
    /** Announced by the lightbox: «Snapshot 05», «Snapshot 14 · Bus». */
    announce: (label: string) => string;
    missing: string;
    footnote: string;
  };
  pairCaption: string;
  diptych: { transit: string; schematic: string; caption: string };
  plate: string;
  download: string;
}

const LETTER_ES = `# Una ciudad merece un mapa

Construimos lugares que no existen.

Les ponemos nombres.

Recordamos sus calles, sus barrios, sus estaciones. Sabemos dónde comenzó todo y qué parte reconstruimos cinco veces hasta que finalmente se sintió bien.

Podemos pasar cientos de horas con una ciudad que nunca vamos a pisar.

Y aun así terminamos queriéndola un poco.

**Creo que algo así merece un mapa.**

[bleed]

---

Me gustan los mapas desde que era niño.

Los dibujaba incluso cuando no había nada que cartografiar. Inventaba lugares simplemente por el gusto de convertir un espacio imaginario en algo que pudiera recorrerse con los ojos.

Años después, jugando *Cities: Skylines* en una vieja laptop, terminé haciéndome una pregunta bastante sencilla:

**¿Puedo ver mi ciudad como un mapa?**

Así conocí CSL Map View.

> Vellum todavía abre los archivos .cslmap y conserva sus tres estilos: Classic, Grayscale y Grayscale + Water.

Recuerdo la primera vez que vi una de mis ciudades convertida en plano. Después se volvió parte de mi manera de jugar. Con una ciudad llamada *Los Santos Pobres* llegué a guardar snapshots conforme crecía y se los mandaba a mis amigos como si estuviera documentando la expansión de un lugar real.

[lsp]

Aquella idea nunca se me fue.

Con los años, *Cities: Skylines* siguió creciendo. CSL Map View dejó de hacerlo.

La herramienta envejeció.

La necesidad no.

**Vellum existe porque esa idea merecía continuar.**

No para reemplazar lo que vino antes ni para fingir que empezó conmigo.

Para recoger algo que me importaba y llevarlo un poco más lejos.

---

## Una ciudad no solo debería poder verse.

**Debería poder leerse.**

Desde la cámara del juego vemos edificios, tráfico, personas, paisajes.

Desde un mapa aparecen otras cosas.

La avenida que terminó convirtiéndose en la columna vertebral de la ciudad.

El barrio que creció alrededor de una carretera.

Una red de metro que parecía un caos y, vista completa, revela su lógica.

O quizá revela precisamente que no la tiene.

[diptych]

Un mapa cambia la manera en que entendemos lo que construimos.

Eso es lo que quiero de Vellum.

No una captura bonita.

No solamente un renderer.

**Un mapa.**

Por eso me importan tanto cosas que pueden parecer insignificantes.

El grosor de una calle.

La forma de una costa.

El espacio entre dos líneas.

Un color apenas más claro.

Qué debe llamar la atención y qué debe quedarse en silencio.

> vellum: la piel fina sobre la que se dibujaban los mapas antiguos.

Porque la belleza aquí no es decoración.

**La belleza también comunica.**

Un mapa precioso que no puede leerse ha fallado.

Un mapa perfectamente legible que trata una ciudad como una masa de geometría también ha perdido algo.

Vellum busca ese punto intermedio.

Claridad.

Carácter.

Calma.

La sensación de estar mirando algo que vale la pena explorar.

---

## Y un mapa debería decir la verdad.

Los datos tienen límites.

Hay cosas que *Cities: Skylines* no nos cuenta. Hay assets que pueden llegar de formas inesperadas. Hay información que simplemente no existe en el archivo.

Cuando Vellum no sabe algo, prefiero que lo admita.

Prefiero un fallback sencillo a una mentira bonita.

Prefiero mostrar una limitación antes que inventar datos para llenar un vacío.

Porque quiero poder confiar en el mapa que estoy mirando.

Y quiero que tú también puedas hacerlo.

---

## Tu ciudad debería seguir siendo tuya.

Vellum funciona localmente.

No necesitas una cuenta para contemplar algo que tú construiste.

Tus ciudades no necesitan subir a un servidor para convertirse en mapas.

Vellum Bridge exporta cuando tú se lo pides.

El archivo sale del juego y llega a tu equipo.

Nada más.

Y no quiero que tengas que confiar únicamente en mi palabra para saberlo.

Puedes mirar el código.

> {github|github.com/sebas-tcotd/vellum}

Puedes comprobarlo.

La transparencia también es una forma de respeto.

---

## Vellum está hecho por una persona.

Pero no quiero que dependa para siempre de una.

Este es mi primer gran proyecto open source.

Para mí también es un experimento.

Después de años trabajando en software necesariamente cerrado, quería construir algo de otra manera.

Abrir las puertas.

Dejar que cualquiera mire dentro.

Que alguien estudie el código.

Que encuentre algo que pueda mejorar.

Que cree un tema que a mí nunca se me habría ocurrido.

> los temas son archivos .vellumstyle; su esquema es público.

Que haga un fork.

Que cambie algo.

Que continúe algo.

Porque hoy estoy aquí cuidando Vellum.

Pero no puedo prometer dónde estaré dentro de diez o veinte años.

Y eso está bien.

Si algún día otra persona recoge el proyecto porque yo ya no puedo hacerlo, no sentiría que me lo quitaron.

Sentiría tranquilidad.

**Significaría que Vellum consiguió vivir más allá de mí.**

El software puede desaparecer cuando desaparece la persona que lo mantiene.

No quiero que tenga que ser así.

> licencia MIT.

---

## 1.0 tampoco significa perfecto.

Significa otra cosa.

Significa que puedo mirar Vellum y decir:

**sí, esto ya representa lo que quería construir.**

Eso no significa que no vaya a aparecer algún bug extraño.

Aparecerá.

Alguna ciudad hará algo que no esperaba.

Alguna combinación imposible de líneas encontrará una esquina del algoritmo que nunca había visto.

Algún asset decidirá ser especialmente creativo.

Vellum está hecho por una persona.

Yo tampoco soy perfecto.

Pero hay una diferencia enorme entre decir *“esto puede tener errores”* y decir *“no importa si los tiene”*.

A mí sí me importa.

Por eso existe el tablero de issues.

> {issues|issues en GitHub}

Si algo falla, quiero saberlo.

Si algo se ve extraño, dime.

Si construiste una ciudad capaz de romper Vellum de una manera completamente nueva, probablemente quiera verla.

Y mientras pueda seguir trabajando en este proyecto, intentaré cuidar aquello que construí.

No porque espere alcanzar alguna clase de perfección.

Sino porque me alegra que alguien quiera usarlo.

---

## Vellum tampoco llegó hasta aquí solo.

Existe sobre el trabajo de personas que construyeron antes.

Sobre quienes investigaron *Cities: Skylines*, crearon mods, documentaron cosas, compartieron herramientas y respondieron preguntas de desconocidos en algún foro años atrás.

Sobre CSL Map View y la persona que tuvo primero aquella idea maravillosa:

**una ciudad de Cities: Skylines también puede ser un mapa.**

Sobre las ciudades de Steam Workshop que utilicé para enfrentar Vellum a lugares mucho más complejos de los que yo habría podido construir únicamente para probarlo.

Sobre todas las personas de aquel primer post en Reddit que se tomaron un momento para mirar mi pequeño proyecto y decirme qué pensaban.

Y también sobre Martín y Mauricio.

Que llevan años viendo mis ciudades, mis capturas, mis avances y mis obsesiones cartográficas con bastante más paciencia de la que probablemente negociaron originalmente.

Gracias.

A todos.

---

Hay una sensación que llevo buscando desde que empecé a construir Vellum.

Me ocurrió cuando cambié su renderer y, por primera vez, pude moverme por una ciudad y sentir:

**esto ya es un mapa.**

Me volvió a ocurrir cuando las primeras redes esquemáticas que antes parecían un enredo empezaron, poco a poco, a tener sentido.

Y todavía aparece de vez en cuando cuando cargo una ciudad que nunca había visto.

Me alejo.

La veo completa.

Y durante unos segundos simplemente pienso:

**qué bonito.**

[plate]

Eso es Vellum para mí.

No quiero que sustituya el juego.

Quiero que te haga apreciarlo de otra manera.

Que puedas detenerte un momento frente a algo que construiste durante decenas o cientos de horas y verlo como una obra completa.

Una ciudad.

Tu ciudad.

Y quizá, después de recorrerla durante un rato, cierres Vellum.

Vuelvas al juego.

Mires ese espacio vacío al otro lado del río.

Y pienses que todavía cabe un barrio más.

Si ocurre eso,

**el mapa habrá hecho su trabajo.**

— Sebastian Vargas Pizango
Lima, 2026

~ Hecho por una persona, con tiempo y cuidado.`;

const LETTER_EN = `# A city deserves a map

We build places that don’t exist.

We give them names.

We remember their streets, their neighbourhoods, their stations. We know where it all began and which part we rebuilt five times until it finally felt right.

We can spend hundreds of hours with a city we will never set foot in.

And even so, we end up loving it a little.

**I think something like that deserves a map.**

[bleed]

---

I’ve loved maps since I was a child.

I drew them even when there was nothing to chart. I invented places just for the pleasure of turning an imaginary space into something you could travel with your eyes.

Years later, playing *Cities: Skylines* on an old laptop, I ended up asking myself a fairly simple question:

**Can I see my city as a map?**

That’s how I found CSL Map View.

> Vellum still opens .cslmap files and keeps their three styles: Classic, Grayscale and Grayscale + Water.

I remember the first time I saw one of my cities turned into a plan. Then it became part of the way I played. With a city called *Los Santos Pobres* I started saving snapshots as it grew, and I sent them to my friends as if I were documenting the expansion of a real place.

[lsp]

That idea never left me.

Over the years, *Cities: Skylines* kept growing. CSL Map View stopped.

The tool grew old.

The need didn’t.

**Vellum exists because that idea deserved to go on.**

Not to replace what came before, nor to pretend it started with me.

To pick up something that mattered to me and carry it a little further.

---

## A city shouldn’t only be seen.

**It should be read.**

From the game camera we see buildings, traffic, people, landscapes.

From a map, other things appear.

The avenue that ended up becoming the backbone of the city.

The neighbourhood that grew around a road.

A metro network that looked like chaos and, seen whole, reveals its logic.

Or perhaps reveals precisely that it has none.

[diptych]

A map changes the way we understand what we build.

That’s what I want from Vellum.

Not a pretty screenshot.

Not just a renderer.

**A map.**

That’s why I care so much about things that may seem insignificant.

The width of a street.

The shape of a coastline.

The space between two lines.

A colour just slightly lighter.

What should call for attention and what should stay quiet.

> vellum: the fine skin on which old maps were drawn.

Because beauty here isn’t decoration.

**Beauty communicates too.**

A beautiful map that can’t be read has failed.

A perfectly legible map that treats a city as a mass of geometry has also lost something.

Vellum looks for that middle ground.

Clarity.

Character.

Calm.

The feeling of looking at something worth exploring.

---

## And a map should tell the truth.

Data has limits.

There are things *Cities: Skylines* doesn’t tell us. There are assets that can arrive in unexpected ways. There is information that simply isn’t in the file.

When Vellum doesn’t know something, I’d rather it admit it.

I prefer a simple fallback to a pretty lie.

I prefer showing a limitation to inventing data to fill a gap.

Because I want to be able to trust the map I’m looking at.

And I want you to be able to trust it too.

---

## Your city should stay yours.

Vellum works locally.

You don’t need an account to contemplate something you built.

Your cities don’t need to go up to a server to become maps.

Vellum Bridge exports when you ask it to.

The file leaves the game and arrives on your computer.

Nothing more.

And I don’t want you to have to take my word alone for it.

You can look at the code.

> {github|github.com/sebas-tcotd/vellum}

You can check it.

Transparency is also a form of respect.

---

## Vellum is made by one person.

But I don’t want it to depend on one forever.

This is my first big open source project.

For me it’s also an experiment.

After years working on software that had to be closed, I wanted to build something a different way.

Open the doors.

Let anyone look inside.

Let someone study the code.

Find something they can improve.

Create a theme that would never have occurred to me.

> themes are .vellumstyle files; their schema is public.

Make a fork.

Change something.

Carry something on.

Because today I’m here, looking after Vellum.

But I can’t promise where I’ll be in ten or twenty years.

And that’s fine.

If someday someone else picks up the project because I no longer can, I wouldn’t feel it had been taken from me.

I’d feel at peace.

**It would mean Vellum managed to live beyond me.**

Software can disappear when the person who maintains it disappears.

I don’t want it to have to be that way.

> MIT licence.

---

## 1.0 doesn’t mean perfect, either.

It means something else.

It means I can look at Vellum and say:

**yes, this now represents what I wanted to build.**

That doesn’t mean some strange bug won’t show up.

It will.

Some city will do something I didn’t expect.

Some impossible combination of lines will find a corner of the algorithm I had never seen.

Some asset will decide to be especially creative.

Vellum is made by one person.

I’m not perfect either.

But there is a huge difference between saying *“this may have bugs”* and saying *“it doesn’t matter if it does”*.

It matters to me.

That’s why the issue board exists.

> {issues|issues on GitHub}

If something breaks, I want to know.

If something looks strange, tell me.

If you built a city capable of breaking Vellum in a completely new way, I’d probably like to see it.

And for as long as I can keep working on this project, I’ll try to look after what I built.

Not because I expect to reach some kind of perfection.

But because it makes me glad that someone wants to use it.

---

## Vellum didn’t get here alone, either.

It stands on the work of people who built before.

On those who studied *Cities: Skylines*, made mods, documented things, shared tools and answered strangers’ questions in some forum years ago.

On CSL Map View and the person who first had that wonderful idea:

**a Cities: Skylines city can also be a map.**

On the Steam Workshop cities I used to put Vellum up against places far more complex than anything I could have built just to test it.

On everyone from that first Reddit post who took a moment to look at my small project and tell me what they thought.

And also on Martín and Mauricio.

Who have spent years watching my cities, my screenshots, my progress and my cartographic obsessions with rather more patience than they probably bargained for.

Thank you.

All of you.

---

There’s a feeling I’ve been chasing since I started building Vellum.

It came when I changed its renderer and, for the first time, I could move through a city and feel:

**this is a map now.**

It came again when the first schematic networks, which used to look like a tangle, slowly began to make sense.

And it still shows up now and then, when I load a city I had never seen.

I zoom out.

I see it whole.

And for a few seconds I simply think:

**how beautiful.**

[plate]

That’s what Vellum is to me.

I don’t want it to replace the game.

I want it to make you appreciate it in another way.

That you can stop for a moment in front of something you built over tens or hundreds of hours and see it as a complete work.

A city.

Your city.

And maybe, after wandering through it for a while, you’ll close Vellum.

Go back to the game.

Look at that empty space on the other side of the river.

And think there’s still room for one more neighbourhood.

If that happens,

**the map will have done its job.**

— Sebastian Vargas Pizango
Lima, 2026

~ Made by one person, with time and care.`;

export const MANIFESTO: Record<Lang, ManifestoCopy> = {
  en: {
    meta: {
      title: 'Manifesto · Vellum',
      description:
        'A city deserves a map: why Vellum exists, in a letter by the person who makes it.',
    },
    eyebrow: 'Manifesto',
    letter: LETTER_EN,
    bleedCaption: 'Day theme · every layer',
    strip: {
      label: 'Los Santos Pobres in CSL Map View, snapshot by snapshot',
      caption: (label) => `Los Santos Pobres · ${label}`,
      announce: (label) => `Snapshot ${label}`,
      missing: '10 · not kept',
      footnote:
        'Original snapshots in CSL Map View, in order, recovered from my old laptop; 00 to 09 are cropped to the framing of 11 to 16. As life goes, number 10 was not kept.',
    },
    pairCaption: 'Snapshot 14, only the bus lines and only the train lines',
    diptych: {
      transit: 'Transit theme · the network over the city',
      schematic: 'Schematic view · the same network, in order',
      caption: 'the same city, two ways to read it',
    },
    plate:
      'The real marginalia of the export: city name, author, legends, scale and north',
    download: 'Download Vellum',
  },
  es: {
    meta: {
      title: 'Manifiesto · Vellum',
      description:
        'Una ciudad merece un mapa: por qué existe Vellum, en una carta de la persona que lo hace.',
    },
    eyebrow: 'Manifiesto',
    letter: LETTER_ES,
    bleedCaption: 'Tema Day · todas las capas',
    strip: {
      label: 'Los Santos Pobres en CSL Map View, snapshot a snapshot',
      caption: (label) => `Los Santos Pobres · ${label}`,
      announce: (label) => `Snapshot ${label}`,
      missing: '10 · no se conservó',
      footnote:
        'Snapshots originales en CSL Map View, en orden, recuperados de mi antigua laptop; de 00 a 09 se recortaron al encuadre de 11 a 16. Por cosas de la vida, la 10 no se conservó.',
    },
    pairCaption: 'Snapshot 14, solo las líneas de bus y solo las de tren',
    diptych: {
      transit: 'Tema Transit · la red sobre la ciudad',
      schematic: 'Vista esquemática · la misma red, ordenada',
      caption: 'la misma ciudad, dos maneras de leerla',
    },
    plate:
      'La marginalia real del export: nombre de la ciudad, autor, leyendas, escala y norte',
    download: 'Descargar Vellum',
  },
};
