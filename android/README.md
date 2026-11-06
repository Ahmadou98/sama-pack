# SAMA-PACK Android — génération et publication

## Architecture

L'application Android est une Trusted Web Activity (TWA) générée avec Bubblewrap.
Elle ouvre https://sama-pack.store en plein écran et conserve le site, Supabase,
les comptes clients, le panier et les commandes comme source unique.

Identifiant Android immuable : `sn.samapack.app`

## Clé de signature

Le fichier `android.keystore` ne doit jamais être ajouté au dépôt.
Il est restauré uniquement dans l'environnement éphémère de GitHub Actions à partir
des secrets GitHub.

Secrets à créer dans Settings → Secrets and variables → Actions :

- `SAMAPACK_ANDROID_KEYSTORE_BASE64` : contenu Base64 du fichier de keystore privé.
- `SAMAPACK_ANDROID_KEYSTORE_PASSWORD` : mot de passe du keystore.
- `SAMAPACK_ANDROID_KEY_PASSWORD` : mot de passe de la clé.

Alias : `samapack`

Ne pas changer la clé après la première diffusion de l'APK. Toutes les mises à jour
doivent être signées avec exactement le même certificat.

## Générer et publier une version

1. Ouvrir l'onglet Actions du dépôt GitHub.
2. Choisir « Build SAMA-PACK Android APK ».
3. Cliquer sur « Run workflow » depuis la branche main.
4. Après réussite, le workflow publie :
   - `downloads/SAMA-PACK.apk`
   - `downloads/SAMA-PACK.apk.sha256`
   - `downloads/version.json`
   - `.well-known/assetlinks.json`
5. Le push sur main déclenche automatiquement le déploiement Cloudflare.
6. Vérifier la page https://sama-pack.store/telecharger-application.html
   et le fichier https://sama-pack.store/.well-known/assetlinks.json

Pour une nouvelle version, incrémenter `appVersion` et `appVersionCode`
dans `twa-manifest.json`, puis relancer le workflow.

## Sécurité

- Ne jamais publier le fichier de keystore ou son mot de passe.
- Ne jamais télécharger de keystore dans le dépôt ou dans les assets Cloudflare.
- Le workflow vérifie que le certificat de l'APK correspond au keystore attendu
  avant toute publication.
- La clé doit être sauvegardée hors de GitHub, dans deux emplacements sécurisés.
