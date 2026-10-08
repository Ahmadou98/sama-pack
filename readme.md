# SAMA-PACK — Site commercial V1

## Ce qui est inclus
- Boutique client responsive
- Catalogue réel des 10 packs du catalogue SAMA-PACK
- Recherche + filtres
- Fiches packs
- Panier
- Checkout
- Génération de commande + ouverture WhatsApp
- Espace de gestion commerciale protégé par code
- Dashboard
- Commandes et statuts
- Clients
- Stock + seuils + coût unitaire + fournisseur
- Fournisseurs
- Dépenses
- Demandes de devis B2B
- Paramètres
- Export / import JSON pour sauvegarde

## Stack
V1 volontairement simple : HTML + CSS + JavaScript natif.
Aucune installation, aucun framework, aucune base de données nécessaire pour démarrer.
Cela correspond à une première version facile à comprendre et à maintenir.

## Important
Les données de gestion sont stockées dans localStorage : elles restent dans le navigateur utilisé.
Cette version est donc parfaite pour démarrer seul ou tester l'activité, mais ce n'est pas encore
une architecture multi-utilisateur avec base de données centrale.

## Mise en ligne gratuite
Le dossier est statique : il peut être publié sur GitHub Pages, Cloudflare Pages, Netlify ou Vercel.
Le fichier `index.html` est le point d'entrée.

## Première utilisation
1. Ouvre `index.html`.
2. Clique sur Gestion.
3. Code initial : `0000`.
4. Va dans Paramètres et remplace le numéro WhatsApp.
5. Remplace le code de gestion.
6. Va dans Stock et renseigne les quantités, seuils, coûts et fournisseurs.
7. Commence à recevoir les commandes.

## Évolution recommandée
Quand les commandes deviennent régulières : conserver cette interface mais migrer les données vers
une API Spring Boot + MySQL/PostgreSQL et une authentification serveur.
