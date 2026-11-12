function normalizeLabel(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

export function mapEtat(etat, _motif = null) {
  const label = normalizeLabel(etat);
  if (label === "enattente") return "pending";
  if (["aenlever", "enleve", "enleves", "enlevee"].includes(label)) return "pending";
  if (label === "audepot") return "depot";
  if (label === "rtndepot") return "returned";
  if (label === "encours") return "in_transit";
  if (label === "averifier") return "to_verify";
  if (
    label === "livrerpaye" ||
    label === "livrepaye" ||
    label === "livrespayes" ||
    /^livre(?:s)?(?:\(s\))?$/.test(label)
  ) {
    return "delivered";
  }
  if (label.startsWith("retour") || label === "retourne" || label === "retournee") {
    return "returned";
  }
  if (label === "echange" || label === "echanges") return "exchange";
  if (label.includes("serieux")) return "unserious";
  return "other";
}
