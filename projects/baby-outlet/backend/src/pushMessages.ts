import type { NotifiableStatus } from "./types";
import type { SupportedLocale } from "./i18n";

type PushCopy = {
  title: (babyName: string) => string;
  body: string;
};

const copy: Record<SupportedLocale, Record<NotifiableStatus, PushCopy>> = {
  "en-GB": {
    labor_started: {
      title: (name) => `${name}: Labour's started!`,
      body: "It's happening! Tap for the latest.",
    },
    gone_to_hospital: {
      title: (name) => `${name} is heading to hospital!`,
      body: "They're heading in. Tap for the latest.",
    },
    born: {
      title: (name) => `${name} is here! 🎉`,
      body: "The wait is over. Tap for the happy news.",
    },
    photo_added: {
      title: (name) => `${name}: New photo! 📸`,
      body: "Tap to have a look!",
    },
    update_posted: {
      title: (name) => `${name}: New update`,
      body: "Tap for the latest.",
    },
  },
  "en-US": {
    labor_started: {
      title: (name) => `${name}: Labor's started!`,
      body: "It's happening! Tap for the latest.",
    },
    gone_to_hospital: {
      title: (name) => `${name} is heading to the hospital!`,
      body: "They're heading in. Tap for the latest.",
    },
    born: {
      title: (name) => `${name} is here! 🎉`,
      body: "The wait is over. Tap for the happy news.",
    },
    photo_added: {
      title: (name) => `${name}: New photo! 📸`,
      body: "Tap to take a look!",
    },
    update_posted: {
      title: (name) => `${name}: New update`,
      body: "Tap for the latest.",
    },
  },
  sv: {
    labor_started: {
      title: (name) => `${name}: Förlossningen är igång!`,
      body: "Värkarna har börjat. Kika in för senaste nytt!",
    },
    gone_to_hospital: {
      title: (name) => `${name}: Nu åker familjen in!`,
      body: "På väg till förlossningen. Kika in för senaste nytt!",
    },
    born: {
      title: (name) => `${name} är här! 🎉`,
      body: "Nu är bäbisen här. Kika in för senaste nytt!",
    },
    photo_added: {
      title: (name) => `Nytt foto på ${name}! 📸`,
      body: "Kika in och ta en titt!",
    },
    update_posted: {
      title: (name) => `${name}: Ny uppdatering`,
      body: "Kika in för senaste nytt!",
    },
  },
  es: {
    labor_started: {
      title: (name) => `${name}: ¡ya empezó el parto!`,
      body: "El parto ya empezó. Entra para ver las novedades.",
    },
    gone_to_hospital: {
      title: (name) => `¡${name} ya va camino al hospital!`,
      body: "Ya van camino al hospital. Entra para ver las novedades.",
    },
    born: {
      title: (name) => `¡${name} ya está aquí! 🎉`,
      body: "¡El bebé ya nació! Entra para ver las novedades.",
    },
    photo_added: {
      title: (name) => `${name}: ¡nueva foto! 📸`,
      body: "Hay una foto nueva. ¡Entra a verla!",
    },
    update_posted: {
      title: (name) => `${name}: nueva novedad`,
      body: "Entra para ver las novedades.",
    },
  },
  "pt-BR": {
    labor_started: {
      title: (name) => `${name}: o trabalho de parto começou!`,
      body: "As contrações começaram. Vem ver as novidades!",
    },
    gone_to_hospital: {
      title: (name) => `${name} está a caminho do hospital!`,
      body: "Já estão a caminho do hospital. Vem ver as novidades!",
    },
    born: {
      title: (name) => `${name} chegou! 🎉`,
      body: "O bebê nasceu! Vem ver as novidades!",
    },
    photo_added: {
      title: (name) => `Foto nova de ${name}! 📸`,
      body: "Acabaram de postar uma foto nova. Vem ver!",
    },
    update_posted: {
      title: (name) => `${name}: novidade nova`,
      body: "Vem ver as novidades!",
    },
  },
};

export function getPushMessage(opts: {
  locale: SupportedLocale;
  status: NotifiableStatus;
  babyName: string;
}) {
  const message = copy[opts.locale][opts.status];
  return { title: message.title(opts.babyName), body: message.body };
}
