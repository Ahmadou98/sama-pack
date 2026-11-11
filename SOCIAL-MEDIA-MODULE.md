# Module Réseaux sociaux SAMA-PACK

## Première livraison

Le module est intégré au back-office existant, dans la rubrique **Marketing & Communication → Réseaux sociaux**.

Il apporte :
- le tableau des cinq plateformes prises en charge (TikTok, Instagram, Facebook, LinkedIn et YouTube) ;
- le formulaire de création de contenus ;
- le choix du mode de diffusion par réseau (automatique, après validation, manuel) ;
- l'enregistrement des brouillons et des dates de programmation en heure de Dakar ;
- le calendrier éditorial des quatorze prochains jours ;
- la bibliothèque de médias via un bucket Supabase privé ;
- la validation des contenus par un administrateur disposant du droit dédié.

## Permissions

Les droits sont ajoutés au système `profiles.admin_permissions` existant :

- `social.view` : consulter les comptes, les programmations et les publications ;
- `social.manage` : créer, modifier et supprimer les contenus, importer les médias ;
- `social.publish` : valider les contenus en attente ;
- `social.accounts.manage` : gérer les futures connexions des comptes sociaux.

L'administrateur général conserve tous les droits. Les droits du collaborateur sont attribués dans **Administration → Comptes administrateurs → Permissions**. Pour gérer le module, le collaborateur doit recevoir au minimum `social.view` et `social.manage`. Pour valider les contenus, ajouter `social.publish`.

Ne pas attribuer les permissions commandes, stock, clients ou paramètres au seul motif que le collaborateur gère les réseaux sociaux.

## Migration

Fichier : `supabase/migrations/202611110001_social_media_admin.sql`

La migration :
- crée les tables sociales publiques et leurs politiques RLS ;
- met en place le bucket privé `sama-social-media` ;
- prépare les tables privées des jetons OAuth chiffrés et des états OAuth ;
- ajoute la fonction de validation ;
- étend la liste blanche de la fonction existante de mise à jour des permissions.

**Cette migration n'est pas appliquée à la base de production par cette branche.** Avant fusion, sauvegarder la base, examiner la migration puis l'appliquer dans l'environnement Supabase prévu.

## Limites de cette livraison

Cette version enregistre les contenus, les médias et le calendrier éditorial. Elle ne publie pas encore vers les plateformes et ne prétend pas que les comptes sont connectés. Les connecteurs OAuth, les applications développeur, les permissions de publication, le moteur de tâches et les statistiques API restent à intégrer et à tester séparément.

Aucune donnée de compte, commande, stock ou client existante n'est modifiée par le code de cette branche tant que la migration n'est pas appliquée.
