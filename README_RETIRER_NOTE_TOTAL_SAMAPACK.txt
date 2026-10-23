SAMA-PACK — Retirer la note technique du panier

Le correctif retire uniquement cette phrase de l'affichage du panier :
« Le total définitif est calculé et validé par le serveur au moment de confirmer la commande. »

Le code qui calcule les montants et confirme la commande n'est pas modifié.

ÉTAPES DANS GITHUB CODESPACES
1. Téléchargez et extrayez le ZIP dans votre Codespace, à la racine du dépôt, là où se trouve app.js.
2. Ouvrez le terminal et exécutez :
   python retirer_note_total_samapack.py
3. Publiez la modification :
   git add app.js
   git commit -m "Retirer la note technique du panier"
   git push
4. Attendez que le déploiement Cloudflare lié au push se termine, puis actualisez le site.

Le script crée une sauvegarde app.js.backup-note-total et refuse de modifier le fichier si la phrase est absente ou présente plusieurs fois. Ne faites pas git add -A, pour éviter d'inclure cette sauvegarde par erreur.
