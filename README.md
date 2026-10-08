# Fasrod — boutique simple (v1)

Next.js 14 + SQLite. Pas de compte client. Commande → base locale → export CSV au format Navex.

## Lancer
```bash
npm install
cp .env.example .env      # puis remplacer ADMIN_PASSWORD par une valeur aléatoire longue
npm run dev               # http://localhost:3010
```
Production : `npm run build && npm start` sur un VPS (le dossier `data/` doit être persistant ;
**ne pas déployer sur Vercel**, SQLite y est éphémère).

## Utilisation
- `/` liste des articles · `/produit/[id]` détail + formulaire de commande
- `/admin` (utilisateur `admin`, mot de passe = `ADMIN_PASSWORD`) : liste + bouton d'export CSV.
  L'export ne prend que les commandes **non exportées** puis les marque (pas de doublons).
  `prix` = articles × quantité + 8 DT, pré-rempli : l'employé le vérifie avant l'import Navex.

## Modifier le catalogue
Depuis `/admin`, ajouter ou modifier les produits, leurs prix, images, couleurs et tailles,
ou les activer/désactiver. Les produits sont stockés dans SQLite et les produits d'origine
sont migrés automatiquement au premier démarrage.
`lib/data.ts` contient uniquement les constantes de commande, les gouvernorats et les données
de migration initiale, ainsi que les frais (`DELIVERY_FEE`) et la quantité max (`MAX_QTY`).
Mettre les photos dans `public/products/` (remplacer les `.svg` provisoires).
Les 24 gouvernorats utilisent l'orthographe exacte de Navex.

## Langues
`components/I18n.tsx` : FR (avec touches tounsi) et AR (écriture arabe, RTL). Faire relire les textes par la cible.

## Sécurité
Honeypot + limite 5 commandes/10 min/IP, prix recalculé côté serveur, CSV nettoyé (`;`, retours ligne, formules Excel), UTF-8 BOM.
