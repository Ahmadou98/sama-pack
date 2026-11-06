# SAMA-PACK — application Android native

## Architecture

Ce projet est une application Android native développée en Kotlin et Jetpack Compose.
Il ne s'agit ni d'une Trusted Web Activity (TWA), ni d'une WebView : l'interface,
la navigation, le catalogue, le panier, le compte client et l'historique des commandes
sont rendus directement par Android.

L'application utilise les mêmes services que la boutique Web :
- Supabase Auth pour les comptes clients ;
- Supabase Postgres et ses politiques RLS pour le catalogue, les profils et les commandes ;
- la fonction transactionnelle `sama_place_order` pour créer les commandes et recalculer côté serveur les prix, disponibilités et frais ;
- la fonction Edge `sama-payment-checkout` pour créer ou vérifier une transaction PayDunya.

Aucune clé `service_role`, aucun mot de passe marchand PayDunya et aucun secret serveur
ne sont intégrés dans le code Android. L'application embarque uniquement la clé
publique Supabase destinée aux clients.

## Compatibilité et signature

- Application ID : `sn.samapack.app`
- Version native initiale : `1.1.0` (versionCode 2)
- Android minimum : API 26 (Android 8.0)
- Compile/target SDK : API 36
- Signature : réutilise le keystore SAMA-PACK existant afin que l'application native
  puisse remplacer l'APK TWA déjà distribué sans perdre son identité Android.

Le SDK Kotlin officiel de Supabase requiert Android API 26 ou supérieur.

## Fonctions disponibles

- Accueil natif et accès aux catégories ;
- catalogue distant avec recherche, packs, produits et outils ;
- fiches produits, photos, promotions et disponibilité ;
- panier conservé localement ;
- création de compte client avec profil et adresse de livraison ;
- connexion et déconnexion Supabase ;
- commande et paiement PayDunya ;
- historique et statut des commandes ;
- reprise et vérification du paiement.

Le paiement se déroule sur la page sécurisée PayDunya ouverte dans le navigateur ou
l'application du prestataire ; le reste de l'application reste natif.

Les notifications push, les paiements hors ligne et la publication Google Play ne font
pas partie de cette première version native.

## Compilation locale

Prérequis : JDK 17, Android SDK API 36 et Gradle 9.7.0.

Depuis ce dossier :

```bash
gradle --no-daemon :app:assembleDebug
```

Pour une version de production, définir les variables d'environnement suivantes
avant de lancer `gradle :app:assembleRelease` :

- `SAMA_ANDROID_KEYSTORE_PATH`
- `SAMA_ANDROID_KEYSTORE_PASSWORD`
- `SAMA_ANDROID_KEY_PASSWORD`

Ne jamais placer le keystore ou ses mots de passe dans le dépôt.

## Publication officielle

Le workflow GitHub Actions `Build SAMA-PACK Native Android` :
1. compile l'application native ;
2. restaure la clé de signature depuis les secrets GitHub ;
3. vérifie le certificat et l'identifiant de l'application ;
4. signe et contrôle l'APK ;
5. prépare le checksum et Digital Asset Links ;
6. publie `downloads/SAMA-PACK.apk` et `downloads/version.json` sur `main`.

Le push de publication déclenche ensuite le déploiement Cloudflare.
