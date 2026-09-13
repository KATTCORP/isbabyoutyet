import type { NotifiableStatus } from "./types";
import type { SupportedLocale } from "./i18n";

type PushCopy = {
  body: string;
  title: (babyName: string) => string;
};

const copy = {
  "en-GB": {
    born: {
      body: "The wait is over. Tap for the happy news.",
      title: (name) => `${name} is here! 🎉`,
    },
    gone_to_hospital: {
      body: "They're heading in. Tap for the latest.",
      title: (name) => `${name} is heading to hospital!`,
    },
    labor_started: {
      body: "It's happening! Tap for the latest.",
      title: (name) => `${name}: Labour's started!`,
    },
    photo_added: {
      body: "Tap to have a look!",
      title: (name) => `${name}: New photo! 📸`,
    },
    update_posted: {
      body: "Tap for the latest.",
      title: (name) => `${name}: New update`,
    },
  },
  "en-US": {
    born: {
      body: "The wait is over. Tap for the happy news.",
      title: (name) => `${name} is here! 🎉`,
    },
    gone_to_hospital: {
      body: "They're heading in. Tap for the latest.",
      title: (name) => `${name} is heading to the hospital!`,
    },
    labor_started: {
      body: "It's happening! Tap for the latest.",
      title: (name) => `${name}: Labor's started!`,
    },
    photo_added: {
      body: "Tap to take a look!",
      title: (name) => `${name}: New photo! 📸`,
    },
    update_posted: {
      body: "Tap for the latest.",
      title: (name) => `${name}: New update`,
    },
  },
  es: {
    born: {
      body: "¡El bebé ya nació! Entra para ver las novedades.",
      title: (name) => `¡${name} ya está aquí! 🎉`,
    },
    gone_to_hospital: {
      body: "Ya van camino al hospital. Entra para ver las novedades.",
      title: (name) => `¡${name} ya va camino al hospital!`,
    },
    labor_started: {
      body: "El parto ya empezó. Entra para ver las novedades.",
      title: (name) => `${name}: ¡ya empezó el parto!`,
    },
    photo_added: {
      body: "Hay una foto nueva. ¡Entra a verla!",
      title: (name) => `${name}: ¡nueva foto! 📸`,
    },
    update_posted: {
      body: "Entra para ver las novedades.",
      title: (name) => `${name}: nueva novedad`,
    },
  },
  "pt-BR": {
    born: {
      body: "O bebê nasceu! Vem ver as novidades!",
      title: (name) => `${name} chegou! 🎉`,
    },
    gone_to_hospital: {
      body: "Já estão a caminho do hospital. Vem ver as novidades!",
      title: (name) => `${name} está a caminho do hospital!`,
    },
    labor_started: {
      body: "As contrações começaram. Vem ver as novidades!",
      title: (name) => `${name}: o trabalho de parto começou!`,
    },
    photo_added: {
      body: "Acabaram de postar uma foto nova. Vem ver!",
      title: (name) => `Foto nova de ${name}! 📸`,
    },
    update_posted: {
      body: "Vem ver as novidades!",
      title: (name) => `${name}: novidade nova`,
    },
  },
  sv: {
    born: {
      body: "Nu är bäbisen här. Kika in för senaste nytt!",
      title: (name) => `${name} är här! 🎉`,
    },
    gone_to_hospital: {
      body: "På väg till förlossningen. Kika in för senaste nytt!",
      title: (name) => `${name}: Nu åker familjen in!`,
    },
    labor_started: {
      body: "Värkarna har börjat. Kika in för senaste nytt!",
      title: (name) => `${name}: Förlossningen är igång!`,
    },
    photo_added: {
      body: "Kika in och ta en titt!",
      title: (name) => `Nytt foto på ${name}! 📸`,
    },
    update_posted: {
      body: "Kika in för senaste nytt!",
      title: (name) => `${name}: Ny uppdatering`,
    },
  },
} satisfies Record<SupportedLocale, Record<NotifiableStatus, PushCopy>>;

export function getPushMessage(opts: {
  babyName: string;
  locale: SupportedLocale;
  status: NotifiableStatus;
}) {
  const message = copy[opts.locale][opts.status];
  return { body: message.body, title: message.title(opts.babyName) };
}

export type OwnerMessagePushEvent = "created" | "updated";

const OWNER_PUSH_BODY_MAX_LENGTH = 180;

type OwnerPushCopy = {
  body: (authorName: string, snippet: string) => string;
  title: (babyName: string, authorName: string) => string;
};

const ownerCopy = {
  "en-GB": {
    created: {
      body: (authorName, snippet) => `${authorName}: ${snippet}`,
      title: (babyName) => `New message for ${babyName}`,
    },
    updated: {
      body: (_authorName, snippet) => snippet,
      title: (babyName, authorName) => `${authorName} updated their message on ${babyName}'s page`,
    },
  },
  "en-US": {
    created: {
      body: (authorName, snippet) => `${authorName}: ${snippet}`,
      title: (babyName) => `New message for ${babyName}`,
    },
    updated: {
      body: (_authorName, snippet) => snippet,
      title: (babyName, authorName) => `${authorName} updated their message on ${babyName}'s page`,
    },
  },
  es: {
    created: {
      body: (authorName, snippet) => `${authorName}: ${snippet}`,
      title: (babyName) => `Nuevo mensaje para ${babyName}`,
    },
    updated: {
      body: (_authorName, snippet) => snippet,
      title: (babyName, authorName) =>
        `${authorName} actualizó su mensaje en la página de ${babyName}`,
    },
  },
  "pt-BR": {
    created: {
      body: (authorName, snippet) => `${authorName}: ${snippet}`,
      title: (babyName) => `Nova mensagem para ${babyName}`,
    },
    updated: {
      body: (_authorName, snippet) => snippet,
      title: (babyName, authorName) =>
        `${authorName} atualizou a mensagem na página de ${babyName}`,
    },
  },
  sv: {
    created: {
      body: (authorName, snippet) => `${authorName}: ${snippet}`,
      title: (babyName) => `Ny hälsning till ${babyName}`,
    },
    updated: {
      body: (_authorName, snippet) => snippet,
      title: (babyName, authorName) =>
        `${authorName} uppdaterade sin hälsning på ${babyName}s sida`,
    },
  },
} satisfies Record<SupportedLocale, Record<OwnerMessagePushEvent, OwnerPushCopy>>;

export function truncateOwnerPushBody(text: string) {
  if (text.length <= OWNER_PUSH_BODY_MAX_LENGTH) {
    return text;
  }
  return `${text.slice(0, OWNER_PUSH_BODY_MAX_LENGTH - 1)}…`;
}

export function getOwnerPushMessage(opts: {
  authorName: string;
  babyName: string;
  event: OwnerMessagePushEvent;
  locale: SupportedLocale;
  message: string;
}) {
  const message = ownerCopy[opts.locale][opts.event];
  const snippet = truncateOwnerPushBody(opts.message);
  return {
    body: message.body(opts.authorName, snippet),
    title: message.title(opts.babyName, opts.authorName),
  };
}
