import type { SupportedLocale } from "./i18n";
import { SUPPORTED_LOCALES } from "./i18n";
import type { Milestone } from "./types";

export const HOMEPAGE_DEMO_PHOTO_KEYS = ["bump", "bag", "labor", "hospital", "born"] as const;

export type HomepageDemoPhotoKey = (typeof HOMEPAGE_DEMO_PHOTO_KEYS)[number];

export const HOMEPAGE_DEMO_PHOTO_FILES: Record<HomepageDemoPhotoKey, string> = {
  bump: "bump.jpg",
  bag: "bag.jpg",
  labor: "labor.jpg",
  hospital: "hospital.jpg",
  born: "born.jpg",
};

/** Due date is two days before "now" — slightly overdue when labour starts. */
export const HOMEPAGE_DEMO_DUE_DATE_MINUTES_AGO = 48 * 60;

export type HomepageDemoFeedSlot =
  | {
      kind: "update";
      minutesAgo: number;
      milestone?: Milestone;
      photo?: HomepageDemoPhotoKey;
    }
  | {
      kind: "encouragement";
      minutesAgo: number;
    };

export type HomepageDemoFeedItem =
  | {
      kind: "update";
      minutesAgo: number;
      message: string;
      milestone?: Milestone;
      photo?: HomepageDemoPhotoKey;
    }
  | {
      kind: "encouragement";
      minutesAgo: number;
      authorName: string;
      message: string;
    };

export type HomepageDemoEncouragementCopy = {
  authorName: string;
  message: string;
};

export type HomepageDemoLocaleCopy = {
  updates: readonly string[];
  encouragements: readonly HomepageDemoEncouragementCopy[];
};

/**
 * Shared timeline shape for every locale demo baby. Copy is filled in from
 * `HOMEPAGE_DEMO_FEED_COPY` so photos, milestones, and timing stay aligned.
 */
export const HOMEPAGE_DEMO_FEED_SLOTS = [
  { kind: "update", minutesAgo: 48 * 60, photo: "bump" },
  { kind: "encouragement", minutesAgo: 46 * 60 },
  { kind: "encouragement", minutesAgo: 44 * 60 },
  { kind: "update", minutesAgo: 41 * 60, milestone: "labor_started" },
  { kind: "encouragement", minutesAgo: 40 * 60 },
  { kind: "encouragement", minutesAgo: 38 * 60 },
  { kind: "update", minutesAgo: 33 * 60, photo: "bag" },
  { kind: "encouragement", minutesAgo: 32 * 60 },
  { kind: "update", minutesAgo: 26 * 60, photo: "labor" },
  { kind: "encouragement", minutesAgo: 25 * 60 },
  { kind: "update", minutesAgo: 20 * 60, milestone: "gone_to_hospital" },
  { kind: "encouragement", minutesAgo: 19 * 60 },
  { kind: "encouragement", minutesAgo: 18 * 60 },
  { kind: "update", minutesAgo: 14 * 60, photo: "hospital" },
  { kind: "encouragement", minutesAgo: 13 * 60 },
  { kind: "update", minutesAgo: 8 * 60 },
  { kind: "encouragement", minutesAgo: 7 * 60 },
  { kind: "encouragement", minutesAgo: 4 * 60 },
  { kind: "update", minutesAgo: 150, milestone: "born", photo: "born" },
  { kind: "encouragement", minutesAgo: 120 },
  { kind: "encouragement", minutesAgo: 90 },
  { kind: "encouragement", minutesAgo: 45 },
  { kind: "encouragement", minutesAgo: 20 },
] satisfies ReadonlyArray<HomepageDemoFeedSlot>;

export const HOMEPAGE_DEMO_FEED_COPY: Record<SupportedLocale, HomepageDemoLocaleCopy> = {
  "en-GB": {
    updates: [
      "40 weeks and this bump is out of control. Restless night. Is tonight the night?",
      "Okay, this is it!! Contractions every 7 minutes. Timing them in the app and trying not to lose the plot.",
      "Contractions are 4 or 5 minutes apart and a lot stronger. Bag's by the door. Midwife says we can stay home a little longer.",
      "Long night on the ball. Slow, wave-by-wave labour. Every message helps 💛",
      "Heading in! Contractions are intense and close together. Time to meet our girl.",
      "Everyone's lovely, the lights are low and the epidural's doing its thing. Now we wait.",
      "8 cm!! So close now. My partner has been an absolute rock.",
      "She's here!! Juniper Mae Hale, 7 lb 2 oz. It was a long labour and we're completely smitten. Thanks for all the love these past two days.",
    ],
    encouragements: [
      { authorName: "Grandma Helen", message: "Rest up, sweetheart. Can't wait to meet her! 💕" },
      {
        authorName: "Sam",
        message: "The nesting is REAL 😂 Biggest hug. You've got this.",
      },
      { authorName: "Maya", message: "YOU'VE GOT THIS. Phone is glued to my hand. Love you both." },
      { authorName: "Uncle Mateo", message: "One wave at a time. So proud of you two." },
      { authorName: "Jess", message: "Thinking of you!! Keep us posted when you can." },
      {
        authorName: "Priya",
        message: "You're doing amazing. We've got the dog if you need anything at all!",
      },
      {
        authorName: "Grandma Helen",
        message: "Drive safely. I'll be thinking of you the whole way.",
      },
      { authorName: "Aunt Leah", message: "Yessss go go go!! Love you." },
      {
        authorName: "Sam",
        message: "A little calm in the middle of it all. Breathe. You're smashing it.",
      },
      { authorName: "Maya", message: "AAAAAAAA I'm pacing. Come on Juniper, you've got this!!" },
      { authorName: "Uncle Mateo", message: "Nearly there. Sending you all my strength." },
      {
        authorName: "Grandma Helen",
        message: "WELCOME JUNIPER MAE HALE 💕💕💕 Grandma is crying happy tears.",
      },
      {
        authorName: "Sam",
        message: "JUNIPER!!!! She's here she's here she's here. Look at that little face.",
      },
      {
        authorName: "Priya",
        message: "Congrats, you two! Rest up. We'll bring food.",
      },
      { authorName: "Jess", message: "Welcome to the world, Juniper. Best news ever." },
    ],
  },
  "en-US": {
    updates: [
      "40 weeks and this bump is out of control. Restless night. Is tonight the night?",
      "Okay, this is it!! Contractions every 7 minutes. Timing them in the app and trying not to freak out.",
      "Contractions are 4 or 5 minutes apart and a lot stronger. Bag's by the door. Midwife says we can stay home a little longer.",
      "Long night on the ball. Slow, wave-by-wave labor. Every message helps 💛",
      "Heading in! Contractions are intense and close together. Time to meet our girl.",
      "Everyone's lovely, the lights are low and the epidural's doing its thing. Now we wait.",
      "8 cm!! So close now. My partner has been an absolute rock.",
      "She's here!! Willow Jane Brooks, 7 lb 2 oz. It was a long labor and we're completely smitten. Thanks for all the love these past two days.",
    ],
    encouragements: [
      { authorName: "Grandma Linda", message: "Rest up, sweetheart. Can't wait to meet her! 💕" },
      {
        authorName: "Casey",
        message: "The nesting is REAL 😂 Biggest hug. You've got this.",
      },
      { authorName: "Maya", message: "YOU'VE GOT THIS. Phone is glued to my hand. Love you both." },
      { authorName: "Uncle Mateo", message: "One wave at a time. So proud of you two." },
      { authorName: "Jess", message: "Thinking of you!! Keep us posted when you can." },
      {
        authorName: "Priya",
        message: "You're doing amazing. We've got the dog if you need anything at all!",
      },
      {
        authorName: "Grandma Linda",
        message: "Drive safe. I'll be thinking of you the whole way.",
      },
      { authorName: "Aunt Leah", message: "Yessss go go go!! Love you." },
      {
        authorName: "Casey",
        message: "A little calm in the middle of it all. Breathe. You're crushing it.",
      },
      { authorName: "Maya", message: "AAAAAAAA I'm pacing. Come on Willow, you've got this!!" },
      { authorName: "Uncle Mateo", message: "Almost there. Sending you all my strength." },
      {
        authorName: "Grandma Linda",
        message: "WELCOME WILLOW JANE BROOKS 💕💕💕 Grandma is crying happy tears.",
      },
      {
        authorName: "Casey",
        message: "WILLOW!!!! She's here she's here she's here. Look at that little face.",
      },
      {
        authorName: "Priya",
        message: "Congrats, you two! Rest up. We'll bring food.",
      },
      { authorName: "Jess", message: "Welcome to the world, Willow. Best news ever." },
    ],
  },
  sv: {
    updates: [
      "Vecka 40 och magen har officiellt tagit över hela kroppen. Sov knappt en blund i natt. Är det i natt det händer?",
      "Okej, nu händer det!! Värkar var sjunde minut. Vi tar tiden i appen och försöker att inte flippa ur.",
      "Värkarna kommer med fyra till fem minuters mellanrum och känns rejält mycket mer. BB-väskan står vid dörren. Barnmorskan tycker att vi kan vara hemma lite till.",
      "Har hängt på pilatesbollen hela natten. Det går långsamt, en värk i taget. Tack för alla meddelanden. De hjälper på riktigt 💛",
      "Nu åker vi in! Värkarna kommer tätt och satan vad de känns. Snart får vi träffa vår lilla tjej.",
      "Nu är vi inne och har landat. Dämpad belysning, epiduralen gör sitt och vi väntar på att hon ska bli redo. Personalen är helt underbar.",
      "8 cm!! Nu är det nära. Min partner är en jävla klippa. Vi känner att hon är på gång.",
      "Hon är här!! Ella Linnea Holm, 3 240 gram, född efter en lång och helt otrolig förlossning. Vi är kära upp över öronen. Tack för att ni hängt med och hejat hela vägen.",
    ],
    encouragements: [
      {
        authorName: "Mormor Ingrid",
        message: "Vila nu, älskling. Längtar så efter att träffa henne! 💕",
      },
      {
        authorName: "Kim",
        message: "Oj vad ni boar! Skickar världens största kram. Det här fixar ni.",
      },
      {
        authorName: "Maja",
        message: "NI FIXAR DET HÄR. Släpper inte mobilen en sekund. Älskar er båda.",
      },
      { authorName: "Farbror Erik", message: "En värk i taget. Så stolt över er." },
      { authorName: "Lisa", message: "Tänker på er!! Hör av er när ni kan." },
      {
        authorName: "Sara",
        message: "Du är grym! Vi tar hand om hunden, så tänk inte på det ❤️",
      },
      { authorName: "Mormor Ingrid", message: "Kör försiktigt. Tänker på er konstant!" },
      { authorName: "Faster Anna", message: "JAAAA, nu händer det!! Älskar er." },
      { authorName: "Kim", message: "Ett andetag i taget. Är så stolt över dig." },
      {
        authorName: "Maja",
        message: "AAAAAAAA jag kan inte sitta still. Kom igen Ella, nu kör vi!!",
      },
      { authorName: "Farbror Erik", message: "Så nära nu! Skickar all kraft jag har." },
      {
        authorName: "Mormor Ingrid",
        message: "VÄLKOMMEN ELLA LINNEA HOLM 💕💕💕 Mormor fulgråter av lycka.",
      },
      {
        authorName: "Kim",
        message: "ELLA!!!! Hon är här, hon är här, hon är här! Titta på de små kinderna.",
      },
      {
        authorName: "Sara",
        message: "Grattis, ni två! Herregud vilken grej. Vila nu, vi kommer med mat.",
      },
      { authorName: "Lisa", message: "Välkommen till världen, Ella! Så himla underbart." },
    ],
  },
  es: {
    updates: [
      "40 semanas y esta barriga ya tiene vida propia. Noche movidita... ¿será hoy?",
      "¡Ahora sí! Contracciones cada 7 minutos. Las estamos cronometrando con la app e intentando mantener la calma.",
      "Las contracciones llegan cada 4 o 5 minutos y vienen mucho más fuertes. La bolsa para el hospital ya está junto a la puerta. Nos dijeron que todavía podemos quedarnos un rato en casa.",
      "Noche larga sobre la pelota de parto. Todo avanza despacio, contracción a contracción. Gracias por cada mensaje. De verdad ayudan 💛",
      "¡Nos vamos! Las contracciones están fuertes y muy seguidas. Es hora de conocer a nuestra niña.",
      "Ya estamos en el hospital. Luces bajas, la epidural está haciendo efecto. Esperamos a que nuestra niña se abra camino. Todo el mundo aquí ha sido un amor.",
      "¡8 cm! Ya falta poco. Mi pareja ha sido una roca. Sentimos que ya viene.",
      "¡Ya está aquí! Lucía Mar Navarro, 3240 g. Nació tras un parto largo y precioso. No cabemos de amor. Gracias por acompañarnos durante estos dos días.",
    ],
    encouragements: [
      { authorName: "Abuela Carmen", message: "Descansa, mi vida. ¡Qué ganas de conocerla! 💕" },
      {
        authorName: "Sofía",
        message: "¡Ese modo nido va EN SERIO! Les mando un abrazo enorme. ¡Ustedes pueden!",
      },
      {
        authorName: "Camila",
        message: "PUEDEN CON ESTO. No suelto el teléfono. Las quiero.",
      },
      {
        authorName: "Tío Mateo",
        message: "Una contracción a la vez. Qué orgulloso estoy de ustedes.",
      },
      { authorName: "Laura", message: "¡Pensando en ustedes! Escriban cuando puedan." },
      {
        authorName: "Valentina",
        message: "¡Lo estás haciendo de maravilla! Nos ocupamos del perro si hace falta.",
      },
      {
        authorName: "Abuela Carmen",
        message: "Vayan con cuidado. Estaré pensando en ustedes todo el camino.",
      },
      { authorName: "Tía Elena", message: "¡Siiiiii! ¡Vamos, vamos, vamos! Las quiero." },
      {
        authorName: "Sofía",
        message: "Un respiro en medio de todo. Estoy muy orgullosa de ti. Respira.",
      },
      {
        authorName: "Camila",
        message: "AAAAAAA, no paro de dar vueltas. ¡Vamos, Lucía, tú puedes!",
      },
      { authorName: "Tío Mateo", message: "Ya casi. Les mando toda mi fuerza." },
      {
        authorName: "Abuela Carmen",
        message: "BIENVENIDA, LUCÍA MAR NAVARRO 💕💕💕 Esta abuela está llorando de alegría.",
      },
      {
        authorName: "Sofía",
        message: "¡LUCÍA! ¡Ya está aquí, ya está aquí, ya está aquí! Mira esa carita.",
      },
      {
        authorName: "Valentina",
        message:
          "¡Felicidades a las dos! Vaya aventura. Descansen. La comida corre por nuestra cuenta.",
      },
      { authorName: "Laura", message: "Bienvenida al mundo, Lucía. ¡Qué alegría!" },
    ],
  },
  "pt-BR": {
    updates: [
      "40 semanas e essa barriga já não cabe em lugar nenhum. Noite agitada. Será que é hoje?",
      "É agora!! Contrações a cada 7 minutos. Estamos contando o intervalo pelo app e tentando manter a calma.",
      "As contrações vêm a cada 4 ou 5 minutos e estão bem mais fortes. A mala já está na porta. A obstetra disse que ainda dá para ficar mais um pouco em casa.",
      "Noite longa na bola. O trabalho de parto vai devagar, uma contração de cada vez. Obrigada por cada mensagem. Elas ajudam de verdade 💛",
      "Partiu hospital! As contrações estão intensas e bem próximas. Hora de conhecer nossa menina.",
      "Já demos entrada e estamos acomodadas. Luz baixinha, peridural fazendo efeito. Agora é esperar ela chegar. Todo mundo aqui tem sido um amor.",
      "8 cm!! Falta pouco. Minha parceira está sendo meu porto seguro. Dá para sentir que ela está chegando.",
      "Ela chegou!! Helena Luz Costa, 3.240 g, nasceu depois de um trabalho de parto longo e lindo. Estamos completamente apaixonadas. Obrigada por ficarem com a gente nesses dois dias.",
    ],
    encouragements: [
      {
        authorName: "Vovó Ana",
        message: "Descansa, meu amor. Não vejo a hora de conhecer essa pequena! 💕",
      },
      {
        authorName: "Mari",
        message: "Modo ninho ATIVADO 😂 Mandando um abraço enorme. Vocês vão tirar isso de letra.",
      },
      {
        authorName: "Beatriz",
        message: "VOCÊS CONSEGUEM. Tô com o celular grudado na mão. Amo vocês duas.",
      },
      {
        authorName: "Tio Pedro",
        message: "Uma contração de cada vez. Orgulho demais de vocês.",
      },
      { authorName: "Júlia", message: "Tô pensando em vocês!! Mandem notícia quando der." },
      {
        authorName: "Fernanda",
        message:
          "Você está mandando muito bem. A gente fica com o cachorro se precisarem de qualquer coisa!",
      },
      {
        authorName: "Vovó Ana",
        message: "Vão com cuidado. Vou ficar pensando em vocês o caminho todo.",
      },
      { authorName: "Tia Luiza", message: "ISSOOOO! VAI, VAI, VAI!! Amo vocês!" },
      {
        authorName: "Mari",
        message: "Respira. Você está mandando muito bem. Orgulho demais de você.",
      },
      {
        authorName: "Beatriz",
        message: "AAAAAAA tô andando de um lado para o outro. Vem, Helena!!",
      },
      { authorName: "Tio Pedro", message: "Tá quase! Tô mandando toda a força do mundo." },
      {
        authorName: "Vovó Ana",
        message: "BEM-VINDA, HELENA LUZ COSTA 💕💕💕 A vovó tá chorando de felicidade aqui.",
      },
      {
        authorName: "Mari",
        message: "HELENA!!!! Ela chegou!!! Olha essa carinha, meu Deus 😭",
      },
      {
        authorName: "Fernanda",
        message:
          "Parabéns, vocês duas! Vocês foram gigantes. Agora descansem que a gente leva comida.",
      },
      { authorName: "Júlia", message: "Bem-vinda ao mundo, Helena! Que notícia linda." },
    ],
  },
};

function updateSlotCount() {
  return HOMEPAGE_DEMO_FEED_SLOTS.filter((slot) => slot.kind === "update").length;
}

function encouragementSlotCount() {
  return HOMEPAGE_DEMO_FEED_SLOTS.filter((slot) => slot.kind === "encouragement").length;
}

export function homepageDemoFeedFor(locale: SupportedLocale): HomepageDemoFeedItem[] {
  const copy = HOMEPAGE_DEMO_FEED_COPY[locale];
  if (copy.updates.length !== updateSlotCount()) {
    throw new Error(`${locale} homepage demo is missing update copy`);
  }
  if (copy.encouragements.length !== encouragementSlotCount()) {
    throw new Error(`${locale} homepage demo is missing encouragement copy`);
  }

  let updateIndex = 0;
  let encouragementIndex = 0;
  return HOMEPAGE_DEMO_FEED_SLOTS.map((slot): HomepageDemoFeedItem => {
    if (slot.kind === "update") {
      const message = copy.updates[updateIndex];
      updateIndex += 1;
      if (!message) throw new Error(`${locale} homepage demo is missing update copy`);
      return {
        kind: "update",
        minutesAgo: slot.minutesAgo,
        message,
        milestone: slot.milestone,
        photo: slot.photo,
      };
    }
    const encouragement = copy.encouragements[encouragementIndex];
    encouragementIndex += 1;
    if (!encouragement) throw new Error(`${locale} homepage demo is missing encouragement copy`);
    return {
      kind: "encouragement",
      minutesAgo: slot.minutesAgo,
      authorName: encouragement.authorName,
      message: encouragement.message,
    };
  });
}

/** @deprecated Prefer `homepageDemoFeedFor(locale)` — kept as the en-GB fixture. */
export const HOMEPAGE_DEMO_FEED = homepageDemoFeedFor("en-GB");

export function homepageDemoLocales(): SupportedLocale[] {
  return [...SUPPORTED_LOCALES];
}
