# Module Réseaux sociaux SAMA-PACK

## État de la livraison

Le module est intégré au back-office sous **Marketing & Communication → Réseaux sociaux**.

- Le schéma Supabase et ses trois migrations ont été appliqués au projet de production.
- L'Edge Function `sama-social-platforms` est déployée.
- Le déclencheur Supabase Cron `sama-pack-social-publisher` vérifie les publications dues toutes les cinq minutes.
- Le bucket privé `sama-social-media` est configuré.
- Les jetons OAuth sont chiffrés avec AES-GCM ; la clé et le jeton de worker sont générés et conservés dans Supabase Vault.
- Les notifications de succès et d'échec sont ajoutées à la boîte de notifications existante, qui alimente les canaux déjà configurés (push/e-mail).

## Fonctions dans le back-office

- Facebook, Instagram, TikTok, LinkedIn et YouTube sont disponibles comme cibles éditoriales.
- Une publication peut contenir un texte commun et des adaptations spécifiques à chaque réseau.
- Les photos et vidéos sont stockées dans un bucket Supabase privé.
- Programmation en heure de Dakar (Africa/Dakar).
- Modes par cible : automatique, après validation ou manuel.
- Calendrier sur les 14 prochains jours.
- Statuts indépendants par réseau, liens des publications, erreurs et relance.
- Tableau d'activité affichant les publications confirmées par réseau.
- Les vues, impressions, mentions J'aime et commentaires ne sont pas encore affichés : leur collecte nécessite des permissions Analytics supplémentaires.

## Publication manuelle TikTok

TikTok est volontairement configuré en **manuel uniquement** dans cet outil privé. Les règles officielles du Content Posting API excluent les outils utilitaires internes limités aux comptes gérés par la même équipe. Le module propose de copier le texte, ouvrir TikTok, puis enregistrer le lien de la publication.

Référence : https://developers.tiktok.com/docs/en/content-sharing-guidelines

## Permissions

Les droits réutilisent `profiles.admin_permissions` :

- `social.view` : consulter les comptes, le calendrier et les résultats.
- `social.manage` : préparer, modifier et supprimer les contenus, ajouter des médias.
- `social.publish` : approuver les contenus, lancer les cibles échues et confirmer les publications manuelles.
- `social.accounts.manage` : connecter ou déconnecter les comptes autorisés.

Le propriétaire/administrateur général conserve les droits globaux. Un collaborateur chargé des réseaux sociaux doit recevoir uniquement les permissions sociales qui lui sont nécessaires, et aucune permission commerciale ou financière par défaut.

## Connexions OAuth à configurer

Callback OAuth à déclarer auprès des développeurs des plateformes :

`https://tbxxrnhcfuaeaatlrdtr.supabase.co/functions/v1/sama-social-platforms`

Ajouter les variables suivantes dans **Supabase → Edge Functions → Secrets** :

| Plateforme | Variables requises |
|---|---|
| Facebook et Instagram | `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_API_VERSION` |
| LinkedIn | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` |
| YouTube | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |

Variable facultative LinkedIn : `LINKEDIN_SCOPES` (par défaut `openid profile w_member_social`). La version LinkedIn peut être précisée par `LINKEDIN_API_VERSION` (valeur par défaut `202610`).

TikTok ne nécessite pas de secrets dans cette configuration manuelle et ne doit pas être connecté via le moteur OAuth.

Conditions spécifiques :
- Facebook : l'application Meta doit disposer des permissions Page nécessaires ; la connexion retourne les Pages administrées.
- Instagram : compte professionnel relié à une Page Facebook et autorisations de publication Instagram.
- LinkedIn : l'accès développeur doit autoriser la publication sur le profil membre.
- YouTube : YouTube Data API v3 doit être activée sur le projet Google Cloud et le scope `youtube.upload` autorisé.

Aucune clé ou aucun secret développeur n'est inventé ou inclus dans le dépôt. Les boutons de connexion restent désactivés tant que les secrets requis ne sont pas disponibles.

## Tests et limites restantes

- Syntaxe vérifiée pour les fichiers JavaScript front-end.
- La fonction Edge a été compilée et déployée par Supabase.
- Les migrations ont été appliquées et le Cron a été vérifié actif.
- Les connexions OAuth n'ont pas encore pu être testées avec de vrais identifiants développeur.
- Les publications réelles et les tests sur comptes réels restent conditionnés à ces connexions.
- Le déploiement du front-end Cloudflare Workers nécessite encore une publication du site depuis le dépôt principal avec Wrangler/Cloudflare, après revue et fusion du PR.
