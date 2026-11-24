/**
 * Catálogo de textos en español latino, con tuteo (sin voseo), cálido y breve.
 * ÚNICO lugar donde cambiar un texto de la app: nada de texto escrito en los componentes.
 * Los valores entre llaves ({n}) se reemplazan al usarlos con t(clave, { n: 3 }).
 * El copy es el provisorio del prototipo; los textos propuestos por UI siguen pendientes de confirmar.
 */
export const es = {
  app: { name: "Ume" },

  nav: {
    label: "Principal",
    home: "Inicio",
    plans: "Planes",
    me: "Yo",
  },

  common: {
    back: "Atrás",
    close: "Cerrar",
    save: "Guardar",
    cancel: "Cancelar",
    continue: "Continuar",
    retry: "Reintentar",
    edit: "Editar",
    minutes: "{n} min",
    hours: "{n} h",
    hoursMinutes: "{h} h {m} min",
  },

  home: {
    title: "Habla con tu coach",
    subtitle: "Cuéntale qué quieres practicar hoy.",
    tapToTalk: "Toca para hablar",
    startMeditation: "Empezar meditación",
    titleNoCoach: "¿Qué quieres practicar hoy?",
    coachReturns: "Tu coach vuelve el {date}.",
    needsInternet: "El coach necesita internet.",
  },

  plans: {
    title: "Tus planes",
    sessionOf: "Sesión {done} de {total} · {minutes} min",
    sessionsCount: "{n} sesiones · {minutes} min",
    next: "Siguiente: {title}",
    completed: "Plan completado",
    favorites: "Favoritas",
    favoritesEmpty: "Aún no tienes favoritas",
    requestNewPlan: "Pedir un plan nuevo al coach",
    progressAria: "Sesión {current} de {total}",
    sessionsAria: "Sesiones del plan",
    sessionDone: "Hecha",
  },

  planDetail: {
    next: "Siguiente",
    completedProgress: "Plan completado · {total} de {total}",
    progress: "Sesión {current} de {total}",
    startSession: "Empezar sesión {n}",
    talkAboutPlan: "Hablar con el coach sobre este plan",
  },

  before: {
    duration: "Duración",
    start: "Comenzar",
    talkAboutMeditation: "Hablar con el coach sobre esta meditación",
  },

  player: {
    pause: "Pausar",
    resume: "Seguir",
    paused: "En pausa",
    addFavorite: "Marcar como favorita",
    removeFavorite: "Quitar de favoritas",
    planAndSession: "{plan} · Sesión {n}",
  },

  talk: {
    listening: "Habla, te escucho.",
    paused: "En pausa",
    tapToResume: "Toca para seguir.",
    pauseAria: "Pausar conversación",
    resumeAria: "Seguir conversación",
    newPlanCard: "Plan nuevo: {name}",
    newPlanSessions: "{n} sesiones",
    startPlan: "Empezar plan",
    building: "Armando tu plan…",
    buildingHint: "Esto toma unos segundos.",
    connectionLost: "Se cortó la conexión",
    reconnecting: "Intentando reconectar…",
    helpTitle: "Lo que cuentas es importante",
    helpBody: "Te sugiero hablarlo con un profesional de la salud. Yo sigo aquí para acompañarte en la práctica.",
  },

  coachUnavailable: {
    quotaTitle: "Tu coach vuelve el {date}",
    quotaBody: "Usaste tus 2 horas de este mes.",
    offlineTitle: "Sin conexión",
    offlineBody: "El coach necesita internet. Tus meditaciones guardadas funcionan igual.",
    goToMeditations: "Ir a mis meditaciones",
  },

  activation: {
    firstTitle: "Hola, soy tu coach de mindfulness",
    firstBody: "Para hablar conmigo necesito el micrófono. Puedes borrar tus datos cuando quieras.",
    allowMic: "Permitir micrófono",
    howWeCare: "Cómo cuidamos tus datos",
    micDeniedTitle: "Sin acceso al micrófono",
    // Texto provisorio: el botón «Abrir ajustes del teléfono» no existe en una web (se resolvió con
    // instrucciones + «Reintentar»; el UI debe confirmar el copy final).
    micDeniedBody: "Sin el micrófono no puedo escucharte. Puedes activarlo en los ajustes de tu teléfono.",
    proposedTitle: "Armé dos planes para ti",
    start: "Empezar",
    bothActive: "Quedan los dos activos.",
  },

  me: {
    title: "Yo",
    profile: "Perfil",
    profileHint: "Objetivos y experiencia",
    settings: "Ajustes",
    settingsHint: "Consumo del bolsón, privacidad y datos",
  },

  profile: {
    title: "Perfil",
    hint: "Lo armó el coach en la entrevista. Puedes corregirlo.",
    goals: "Objetivos",
    experience: "Experiencia",
    currentState: "Estado actual",
    editGoals: "Editar objetivos",
    editExperience: "Editar experiencia",
    editCurrentState: "Editar estado actual",
    goalsHint: "Escríbelos con tus palabras.",
    experienceHint: "Tu experiencia con la meditación.",
    currentStateHint: "Cuéntalo con tus palabras.",
    notSet: "Sin completar",
    experienceOptions: {
      principiante: "Principiante",
      algo_practica: "Algo de práctica",
      mucha_practica: "Con mucha práctica",
    },
  },

  settings: {
    title: "Ajustes",
    usage: "Consumo del bolsón",
    remaining: "Te quedan {remaining} de {total}",
    renewsOn: "Se renueva el {date}.",
    privacy: "Privacidad y datos",
    privacyHint: "Gestiona tus datos de bienestar",
    privacyIntro: "Gestiona tus datos de bienestar.",
    deleteAll: "Borrar todos mis datos",
    confirmTitle: "¿Borrar todos tus datos?",
    confirmBody: "Se borrarán tu perfil, tus planes y tus charlas. No se puede deshacer.",
    confirmDelete: "Borrar todo",
    deletedTitle: "Listo, borramos tus datos",
    deletedBody: "Cuando quieras, puedes empezar de nuevo.",
  },

  technique: {
    respiracion: "Respiración",
    escaneo_corporal: "Escaneo corporal",
    atencion_plena: "Atención plena",
    visualizacion: "Visualización",
    otra: "",
  },

  // Texto provisorio por técnica: el contrato no trae descripción de la sesión (duda pendiente de backend).
  techniqueIntro: {
    respiracion: "Un ritmo de respiración lento para aquietar la mente.",
    escaneo_corporal: "Un recorrido por tu cuerpo, de pies a cabeza, para soltar la tensión.",
    atencion_plena: "Atención al momento presente, sin juzgar lo que aparece.",
    visualizacion: "Un paseo guiado por un lugar tranquilo.",
    otra: "Una práctica guiada para soltar y descansar.",
  },

  /** Pantallas aún sin construir (cada una llega en su historia). */
  stub: {
    pending: "Esta pantalla llega en su historia.",
    screens: {
      activationFirst: "Primer uso",
      interview: "Entrevista inicial",
      proposedPlans: "Planes propuestos",
      talk: "Charla con el coach",
      closingTalk: "Charla de cierre",
      player: "Meditación en curso",
      coachUnavailable: "Coach no disponible",
      dataDeleted: "Datos borrados",
      notFound: "No encontramos esa pantalla",
    },
  },

  /** Galería de componentes (solo en desarrollo). */
  kit: {
    title: "Componentes",
    map: "Mapa de pantallas",
    demoQuota: "Tiempo con el coach",
    demoQuotaOn: "Con bolsón",
    demoQuotaOff: "Bolsón en 0",
    demoConnection: "Conexión",
    demoOnline: "Con conexión",
    demoOffline: "Sin conexión",
  },
} as const;
