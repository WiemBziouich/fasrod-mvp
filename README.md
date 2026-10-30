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
- `/admin/commandes` : les commandes au panier et au téléphone correspondants dans les 30 jours
  sont créées normalement puis placées en revue. Une décision admin est conservée dans
  `order_review_history`. Les commandes en revue et les doublons confirmés sont exclus des deux
  exports Navex; les colonnes et le format Navex restent inchangés. Chaque export normal crée
  un lot récupérable et les commandes ne deviennent éligibles au nettoyage qu'après confirmation
  de leur import Navex, puis 30 jours supplémentaires.

## Migration locale des lots d'export
La migration additive `scripts/migrate-export-batches.mjs` ajoute les identifiants de lots et
les dates de confirmation, crée `export_batches` et son index. Elle ne modifie ni ne supprime
les commandes existantes. Elle n'accepte que `file:data/orders.db`, vérifie que le fichier local
existe et saute les colonnes déjà présentes.

Après autorisation explicite, arrêter l'application, sauvegarder la base locale et vérifier
qu'il s'agit bien de la base voulue. Depuis la racine du dépôt, exécuter :

```powershell
node --env-file=.env.local .\scripts\migrate-export-batches.mjs
```

Le script refuse toute URL autre que la base SQLite locale et ne permet pas de dérogation distante.
Ne pas exécuter cette migration sur une base distante ni pendant qu'un processus utilise la base.
Cette commande n'autorise ni ne réalise une migration de production.

## Migration locale pour la revue des doublons
La migration additive `scripts/migrate-duplicate-review.mjs` n'est pas exécutée par le démarrage
de l'application. Elle ajoute les statuts `normal`, `pending_review`, `confirmed_new` et
`confirmed_duplicate`, la référence `duplicate_of`, ainsi que l'historique des décisions.
Les commandes existantes reçoivent `normal` par défaut; aucune commande n'est supprimée.

Après autorisation explicite, depuis la racine du dépôt et uniquement lorsque l'application
n'utilise pas la base locale, vérifier que `data/orders.db` est bien la base à migrer puis exécuter
dans PowerShell :

```powershell
cmd.exe /d /c "set TURSO_DATABASE_URL=file:data/orders.db&& node .\scripts\migrate-duplicate-review.mjs"
```

Le script refuse toute valeur autre que `file:data/orders.db`, ne charge pas les fichiers
d'environnement, vérifie le chemin local et ne se connecte jamais à Turso. Ne pas lancer cette
migration contre un processus actif ou avant d'avoir autorisé cette étape. Cette commande transmet
l'URL locale uniquement au processus enfant et ne remplace pas la variable d'environnement de la
session PowerShell appelante.

## Migration Turso pour la revue des doublons (non exécutée)

La migration distante, `scripts/migrate-duplicate-review-turso.mjs`, est distincte du script
strictement local ci-dessus. Elle ne charge aucun fichier `.env`. Elle exige les variables
`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` et `TURSO_MIGRATION_EXPECTED_HOST`, fournies
explicitement par l'opérateur. L'hôte attendu doit correspondre exactement à celui de l'URL.
Le script refuse les URL `file:`, les hôtes locaux/IP, les identifiants intégrés à l'URL et
les composants d'URL non pris en charge; il n'affiche jamais l'URL ni le jeton.

Avant d'autoriser toute exécution distante :

1. Choisir un instant RFC3339 et créer une base de sauvegarde nommée et conservée sans
   modification depuis la production :
   `turso db create <backup-name> --from-db <source-name> --timestamp <RFC3339-timestamp>`.
   La documentation Turso décrit `--from-db` comme la création d'une base depuis une autre
   base, avec copie à un point dans le temps. Vérifier que cette copie contient tout le schéma
   et toutes les données attendues; ne pas l'altérer après cette validation.
2. Créer une base de préproduction distincte depuis la copie de sauvegarde :
   `turso db create <preprod-name> --from-db <backup-name>`. C'est cette copie restaurée,
   et uniquement elle, qui sert aux essais de migration. Cela fournit une copie complète
   restaurable dans Turso, mais pas un fichier de sauvegarde hors ligne.
3. Les pages officielles consultées décrivent la création depuis un fichier SQLite
   (`--from-file`) ou un dump SQL (`--from-dump`), mais ne documentent pas ici de commande
   d'export d'une base distante vers ces fichiers. Si une sauvegarde hors Turso est exigée,
   confirmer au préalable une méthode d'export officielle pour le compte et la version
   utilisés. Ne pas considérer les CSV Navex ou de nettoyage comme une sauvegarde.
4. Relever avant migration les nombres de lignes de `orders`, `order_items` et
   `order_review_history`, ainsi que les références orphelines dans les articles, les
   commandes et l'historique. Ne consigner que les nombres et métadonnées de schéma, jamais
   les données client. Comparer également le schéma et les index entre la copie sauvegarde et
   la préproduction restaurée. S'assurer qu'aucune application, export ou tâche de nettoyage
   n'écrit dans la base de préproduction pendant la migration et les comparaisons.
5. Fournir de façon sécurisée, dans un processus dédié et pour la seule base de préproduction,
   `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` et `TURSO_MIGRATION_EXPECTED_HOST`, ce dernier
   étant exactement l'hôte de la base ciblée. Puis exécuter
   `node .\scripts\migrate-duplicate-review-turso.mjs`. Ne pas charger de fichiers `.env` ni
   utiliser les valeurs de production. Le script vérifie les tables, objets préexistants,
   statuts et références avant écriture; il n'ajoute que les colonnes/table/index manquants,
   vérifie le schéma obtenu et confirme que les nombres de lignes sont inchangés. Après une
   interruption, inspecter l'étape en échec et relancer sur la même base de préproduction :
   le script valide les objets existants puis reprend les éléments manquants sans réinitialiser
   les données.
6. Rejouer la migration sur la préproduction et confirmer que les nombres de lignes restent
   identiques. Tester ensuite les décisions humaines, les références, les nettoyages et les
   deux exports Navex (dont `?all=1`) : en-têtes, ordre des colonnes, séparateurs, CRLF,
   échappement, noms de fichiers et comportement `exported_at`. Utiliser des commandes
   synthétiques pour tester les suppressions; comparer les nombres et vérifier l'absence de
   références orphelines avant/après.
7. Préparer une étape de production séparément et avec une nouvelle autorisation, uniquement
   après restauration de la sauvegarde et réussite de tous les contrôles de préproduction.
   Appliquer le schéma avant de déployer le code qui utilise les nouveaux objets. Cette
   documentation n'autorise aucune connexion ni migration de production.

La migration distante ajoute `duplicate_status` sans `CHECK` : la documentation Turso actuelle
sur `ALTER TABLE ... ADD COLUMN` exige une table vide lorsqu'on ajoute une colonne avec
`CHECK`. L'application valide les statuts pour cette voie additive; la table d'historique
créée conserve sa contrainte de statut. `duplicate_of` reste un entier sans clé étrangère,
comme dans le schéma local. L'API de revue vérifie l'existence d'une référence et les routes de
nettoyage protègent les commandes référencées ou historisées. L'historique enregistre
`reviewed_by = 'admin'`, identifiant de l'utilisateur Basic actuel; les entrées antérieures à
cette colonne reçoivent `'unknown'` par défaut. Toutefois, Turso indique que l'application
des clés étrangères est désactivée par défaut, et l'application ne l'active pas sur chaque
connexion. Les clés étrangères déclarées dans l'historique ne protègent donc pas
les écritures/suppressions directes en base. Cette migration n'ajoute ni trigger ni contrainte
supplémentaire : tester cette limite en préproduction et décider d'un mécanisme d'intégrité
séparément revu avant la production si les écritures directes doivent être bloquées.

Références : [ALTER TABLE Turso](https://docs.turso.tech/sql-reference/statements/alter-table.md),
[PRAGMA Turso](https://docs.turso.tech/sql-reference/pragmas.md),
[création de base Turso](https://docs.turso.tech/cli/db/create.md) et
[guide de migration/import Turso](https://docs.turso.tech/cloud/migrate-to-turso.md).

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
