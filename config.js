// MyDay 2.0 – innstillinger
// Lim inn verdiene fra Firebase-konsollen (Prosjektinnstillinger → Dine apper → Nettapp).
// Disse verdiene er ikke hemmelige; tilgangen styres av Firestore-reglene i firestore.rules.
export const firebaseConfig = {
  apiKey: "LIM-INN",
  authDomain: "LIM-INN.firebaseapp.com",
  projectId: "LIM-INN",
  storageBucket: "LIM-INN.firebasestorage.app",
  messagingSenderId: "LIM-INN",
  appId: "LIM-INN",
};

// Entur ber om et klientnavn på formen "selskap-app". Ingen nøkkel trengs.
export const enturClientName = "larsiveg-myday2";
