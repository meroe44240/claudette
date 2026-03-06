# Guide d'import - HumanUp ATS

## Formats supportes

Actuellement, seul le format **CSV** est supporte pour l'import de donnees.

Encodage recommande : **UTF-8** (avec ou sans BOM).

## Processus d'import

L'import se deroule en 4 etapes :

### Etape 1 : Upload du fichier

- Acceder a **Parametres > Import de donnees**
- Selectionner le type d'entite a importer (candidats, entreprises, clients)
- Deposer ou selectionner le fichier CSV

### Etape 2 : Mapping des colonnes

Le systeme detecte automatiquement les en-tetes du CSV et propose un mapping vers les champs HumanUp.

| Champ HumanUp      | Exemples d'en-tetes CSV reconnus                |
| ------------------- | ------------------------------------------------ |
| `nom`               | Nom, Last Name, Surname                          |
| `prenom`            | Prenom, First Name, Given Name                   |
| `email`             | Email, E-mail, Courriel                          |
| `telephone`         | Telephone, Phone, Tel, Mobile                    |
| `posteActuel`       | Poste, Job Title, Current Position               |
| `entrepriseActuelle`| Entreprise, Company, Organisation                |
| `localisation`      | Ville, City, Location, Localisation              |
| `linkedinUrl`       | LinkedIn, LinkedIn URL, Profil LinkedIn          |
| `source`            | Source, Origine                                  |
| `tags`              | Tags, Competences, Skills (separes par des `;`)  |

Verifier et ajuster le mapping avant de continuer.

### Etape 3 : Verification et detection de doublons

Le systeme analyse les donnees et identifie :
- **Lignes valides** : pretes a l'import
- **Doublons potentiels** : correspondance par email ou combinaison nom + prenom
- **Erreurs** : champs obligatoires manquants

Pour chaque doublon detecte, vous pouvez :
- **Ignorer** : ne pas importer cette ligne
- **Mettre a jour** : fusionner avec l'enregistrement existant
- **Creer quand meme** : forcer la creation d'un nouvel enregistrement

### Etape 4 : Confirmation et import

- Verifier le resume (nombre de creations, mises a jour, lignes ignorees)
- Lancer l'import
- Un rapport final est affiche avec le detail des operations effectuees

## Detection de doublons

La detection se base sur :

1. **Email exact** : correspondance stricte sur l'adresse email
2. **Nom + Prenom** : correspondance insensible a la casse et aux accents

## Conseils pour la migration depuis Jarvi

Si vous migrez des donnees depuis Jarvi :

1. **Export Jarvi** : exporter les donnees au format CSV depuis Jarvi
2. **Nettoyage** : verifier l'encodage (convertir en UTF-8 si necessaire)
3. **Colonnes tags** : les competences Jarvi peuvent etre importees comme tags. Separer les valeurs multiples par un point-virgule (`;`)
4. **Statuts** : les statuts Jarvi ne correspondent pas directement aux stages HumanUp. Importer d'abord les candidats, puis creer manuellement les mandats et candidatures
5. **Test** : faire un premier import avec un petit echantillon (10-20 lignes) pour valider le mapping avant l'import complet

## Limites

- Taille maximale du fichier : **10 Mo**
- Nombre maximum de lignes par import : **5 000**
- Les fichiers avec plus de 50 colonnes seront rejetes
