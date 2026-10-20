import rawLocations from "./tunisia-locations.json";

// Source du dataset : https://github.com/mn-youssef/state-municipality-tunisia

export type TunisiaDelegation = {
  Name: string;
  NameAr: string;
  Value: string;
  PostalCode?: string;
  Latitude?: number;
  Longitude?: number;
};

type TunisiaGovernorate = {
  Name: string;
  NameAr: string;
  Value: string;
  Delegations: TunisiaDelegation[];
};

const locations = rawLocations as TunisiaGovernorate[];

const DATASET_NAME_BY_FASROD_NAME: Record<string, string> = {
  Ariana: "ARIANA",
  Béja: "BEJA",
  "Ben Arous": "BEN AROUS",
  Bizerte: "BIZERTE",
  Gabès: "GABES",
  Gafsa: "GAFSA",
  Jendouba: "JENDOUBA",
  Kairouan: "KAIROUAN",
  Kasserine: "KASSERINE",
  Kébili: "KEBILI",
  "La Mannouba": "MANNOUBA",
  "Le Kef": "KEF",
  Mahdia: "MAHDIA",
  Médenine: "MEDENINE",
  Monastir: "MONASTIR",
  Nabeul: "NABEUL",
  Sfax: "SFAX",
  "Sidi Bouzid": "SIDI BOUZID",
  Siliana: "SILIANA",
  Sousse: "SOUSSE",
  Tataouine: "TATAOUINE",
  Tozeur: "TOZEUR",
  Tunis: "TUNIS",
  Zaghouan: "ZAGHOUAN",
};

export function getDelegations(governorate: string): TunisiaDelegation[] {
  const datasetName = DATASET_NAME_BY_FASROD_NAME[governorate];
  return locations.find((location) => location.Name === datasetName)?.Delegations ?? [];
}

export function isValidDelegation(governorate: string, city: string): boolean {
  return getDelegations(governorate).some((delegation) => delegation.Value === city);
}
