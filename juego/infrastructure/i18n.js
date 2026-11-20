// ─── Traductor ES→FR de la interfaz (uso personal, práctica de francés) ───
// Reemplaza en vivo el texto visible de la app por francés, sin tocar el
// código fuente ni los datos: es una capa de "recubrimiento" sobre el DOM.
//
// La cotización (todo lo que vive dentro de #qWrap, incluido lo que se
// imprime/copia/envía al cliente) NUNCA se traduce — siempre queda en
// español, sin importar el idioma elegido para el resto de la interfaz.
//
// El botón para cambiar de idioma solo es visible para el super-admin
// (ver body.admin-user en index.html), así que en la práctica solo Samuel
// puede activar/ver el francés.
//
// Cobertura: todo el "chrome" estático (menús, botones, pestañas, modales,
// tooltips) más los mensajes dinámicos más comunes (contadores, toasts de
// uso diario). Mensajes muy raros de error/admin con texto crudo del
// sistema pueden quedar parcialmente en español — es un límite aceptado,
// no afecta la cotización ni el uso normal de la app.
(function () {
  var STORAGE_KEY = 'sl_app_lang';
  var NEVER_TRANSLATE_IDS = ['qWrap'];

  var FR_DICT = {
    // ── Marca / sidebar ──
    "Suite de ventas": "Suite de ventes",
    "Total cotización": "Total du devis",
    "Descuento": "Remise",
    "Aumento": "Majoration",
    "Aplicar Retefuente 2.5%": "Appliquer la retenue à la source 2,5 %",
    "Retefuente 2.5% aplicada": "Retenue à la source 2,5 % appliquée",
    "Retefuente 2.5%:": "Retenue à la source 2,5 % :",
    "Neto a pagar:": "Net à payer :",
    "Mostrar IVA en cotización": "Afficher la TVA dans le devis",
    "Mostrar/ocultar campos": "Afficher/masquer les champs",

    // ── Encabezado ──
    "Encabezado": "En-tête",
    "N° Cot.": "N° Devis",
    "Cliente": "Client",
    "Nombre cliente": "Nom du client",
    "Asesor": "Conseiller",
    "Tu nombre": "Votre nom",
    "Validez": "Validité",
    "1 día": "1 jour",
    "Garantía": "Garantie",
    "12 meses": "12 mois",
    "Ej: 6 meses": "Ex : 6 mois",
    "WhatsApp": "WhatsApp",
    "Salir": "Se déconnecter",

    // ── Asistente IA ──
    "Asistente IA": "Assistant IA",
    "Escanear cotización QR": "Scanner un devis QR",
    "Cotizar competencia": "Devis concurrent",
    "Armar PC": "Configurer un PC",
    "Responder cliente": "Répondre au client",
    "Foto de tu cotización → la importa con los precios actuales del catálogo": "Photo de votre devis → l'importe avec les prix actuels du catalogue",
    "Foto de cotización de otra tienda → busca equivalentes en nuestro catálogo": "Photo d'un devis d'un autre magasin → cherche des équivalents dans notre catalogue",
    "Foto de tu cotización → importar": "Photo de votre devis → importer",
    "La importa con los precios actuales del catálogo · o pega con Ctrl+V": "L'importe avec les prix actuels du catalogue · ou collez avec Ctrl+V",
    "Cotización del cliente → equivalentes": "Devis du client → équivalents",
    "Sube cotización de otra tienda o foto de lista · o pega con Ctrl+V": "Téléversez le devis d'un autre magasin ou une photo de liste · ou collez avec Ctrl+V",
    "Pega la pregunta del cliente aquí...": "Collez ici la question du client...",
    "Tu contexto (opcional): Ej: 8 núcleos, batería 72Wh, incluye funda...": "Votre contexte (optionnel) : Ex : 8 cœurs, batterie 72Wh, housse incluse...",
    "Generar respuesta": "Générer une réponse",
    "Asistente de Ensambles": "Assistant d'assemblage",
    "Componentes": "Composants",
    "Sugerir uno o varios componentes sueltos": "Suggérer un ou plusieurs composants isolés",
    "PC completo": "PC complet",
    "Arma un PC de escritorio completo y compatible": "Assemble un PC de bureau complet et compatible",
    "Portátil": "Portable",
    "Buscar portátiles o accesorios": "Rechercher des portables ou accessoires",
    "Ej: SSD 1TB barato, o RTX 4060 y board compatible": "Ex : SSD 1 To pas cher, ou RTX 4060 et carte compatible",
    "Ej: Portátil para la universidad max 2 millones": "Ex : Portable pour l'université, max 2 millions",
    "Ej: PC Gamer 5 millones con gráfica NVIDIA": "Ex : PC Gamer 5 millions avec carte graphique NVIDIA",
    "Buscar con IA": "Rechercher avec l'IA",
    "Armando...": "Assemblage...",

    // ── Condiciones / Productos ──
    "Condiciones": "Conditions",
    "Condiciones / Notas": "Conditions / Notes",
    "Ej: Precios sujetos a disponibilidad. Pago anticipado. Garantía de fábrica...": "Ex : Prix sujets à disponibilité. Paiement anticipé. Garantie du fabricant...",
    "Productos": "Produits",
    "Añade del catálogo o pega tu lista arriba": "Ajoutez depuis le catalogue ou collez votre liste ci-dessus",
    "Añadir producto manual": "Ajouter un produit manuellement",
    "Nombre del producto": "Nom du produit",
    "Precio COP (ej: 1.500.000)": "Prix COP (ex : 1 500 000)",
    "Añadir": "Ajouter",
    "Limpiar todo": "Tout effacer",
    "Cerrar sesión": "Se déconnecter",

    // ── Top bar ──
    "Historial": "Historique",
    "Ver comparación": "Voir la comparaison",
    "Copiar imagen": "Copier l'image",
    "Windows/Chrome: copia al portapapeles · Safari/iPad: descarga como PNG": "Windows/Chrome : copie dans le presse-papiers · Safari/iPad : téléchargement en PNG",
    "PDF": "PDF",
    "Configuración": "Paramètres",

    // ── Pestañas ──
    "Cotización": "Devis",
    "Catálogo": "Catalogue",
    "Catálogo ·": "Catalogue ·",
    "Calculadora IVA": "Calculateur de TVA",
    "Tienda": "Boutique",
    "Comparar": "Comparer",
    "Recogidas": "Retraits",
    "Cuadre de Caja": "Clôture de caisse",
    "SIIGO": "SIIGO",
    "Abrir la facturación SIIGO en una pestaña nueva": "Ouvrir la facturation SIIGO dans un nouvel onglet",
    "Admin": "Admin",
    "Herramientas de administración": "Outils d'administration",
    "Parser PDF": "Analyseur PDF",
    "Usuarios": "Utilisateurs",
    "Métricas": "Métriques",

    // ── Estado vacío cotización ──
    "¡Bienvenido! ¿Listo para cotizar?": "Bienvenue ! Prêt à faire un devis ?",
    "Agrega productos del catálogo o pega tu lista": "Ajoutez des produits du catalogue ou collez votre liste",

    // ── Catálogo ──
    "Lista 1": "Liste 1",
    "Lista 2": "Liste 2",
    "Activar Lista 2": "Activer la Liste 2",
    "Cargando...": "Chargement...",
    "Cargando…": "Chargement…",
    "Buscar nombre o SKU...": "Rechercher par nom ou SKU...",
    "Todas las categorías": "Toutes les catégories",
    "Catálogo no cargado. La Lista 1 se carga automáticamente. Si ves este mensaje, recarga la página.": "Catalogue non chargé. La Liste 1 se charge automatiquement. Si vous voyez ce message, rechargez la page.",
    "Sube tu catálogo": "Téléversez votre catalogue",
    "Para empezar a cotizar, importa la lista de precios de tu tienda como PDF. Solo tienes que hacerlo una vez.": "Pour commencer à faire des devis, importez la liste de prix de votre magasin en PDF. Vous n'avez à le faire qu'une seule fois.",
    "Ve a la página de tu tienda": "Allez sur le site de votre magasin",
    "Entra al sitio web donde tu empresa publica la lista de precios pública.": "Accédez au site où votre entreprise publie la liste de prix publique.",
    "Descarga el PDF de la lista": "Téléchargez le PDF de la liste",
    "Usa la opción \"Imprimir → Guardar como PDF\" o el botón de descarga. Si te da a elegir, usa escala 85% para mejor lectura.": "Utilisez l'option « Imprimer → Enregistrer en PDF » ou le bouton de téléchargement. En cas de choix, utilisez une échelle de 85 % pour une meilleure lisibilité.",
    "Súbelo en el Parser PDF": "Téléversez-le dans l'analyseur PDF",
    "Pestaña Parser PDF → arrastra tu archivo → Parsear → presiona Guardar en Lista 1.": "Onglet Analyseur PDF → glissez votre fichier → Analyser → cliquez sur Enregistrer dans Liste 1.",
    "Ir al Parser PDF": "Aller à l'analyseur PDF",
    "Solo sube listas de precios públicas o de tu propia empresa.": "Ne téléversez que des listes de prix publiques ou celles de votre propre entreprise.",
    "Ver tienda": "Voir la boutique",
    "Lista Lago vacía": "Liste Lago vide",
    "Carga un JSON con el botón Lago de arriba": "Chargez un JSON avec le bouton Lago ci-dessus",
    "Sin resultados": "Aucun résultat",
    "+ Añadir": "+ Ajouter",

    // ── Calculadora IVA ──
    "Extractor de IVA": "Extracteur de TVA",
    "Pega la remisión completa — detecta productos, calcula base y IVA automáticamente": "Collez le bon de livraison complet — détecte les produits, calcule la base et la TVA automatiquement",
    "IVA 19%": "TVA 19 %",
    "Texto de la remisión": "Texte du bon de livraison",
    "Pega aquí toda la remisión": "Collez ici tout le bon de livraison",
    "Pega texto arriba para empezar": "Collez du texte ci-dessus pour commencer",
    "Limpiar": "Effacer",
    "Código": "Code",
    "Descripción": "Description",
    "P. con IVA": "Prix TVA incl.",
    "Base gravable": "Base imposable",
    "IVA": "TVA",
    "No se detectaron productos. Asegúrate de que cada línea empiece con el código SKU seguido de guión. Ej: 26123(B1) - Producto 43,000 129,000": "Aucun produit détecté. Assurez-vous que chaque ligne commence par le code SKU suivi d'un tiret. Ex : 26123(B1) - Produit 43 000 129 000",
    "Total base gravable:": "Total base imposable :",
    "⊩ Copiar todo para SIIGO": "⊩ Tout copier pour SIIGO",

    // ── Modo comparación ──
    "Modo comparación": "Mode comparaison",
    "Captura dos versiones de cotización para mostrarle al cliente las opciones": "Capturez deux versions du devis pour montrer les options au client",
    "Guardar como Opción A": "Enregistrer comme option A",
    "Guardar como Opción B": "Enregistrer comme option B",
    "Sin comparaciones aún": "Aucune comparaison pour l'instant",
    "Arma una cotización, luego usa los botones de arriba para guardarla como Opción A o B": "Créez un devis, puis utilisez les boutons ci-dessus pour l'enregistrer comme option A ou B",

    // ── Parser PDF ──
    "Administración": "Administration",
    "Parser PDF de Partes": "Analyseur PDF de pièces",
    "Extrae SKU, nombre, categoría y precio de listas de precios en PDF.": "Extrait le SKU, le nom, la catégorie et le prix des listes de prix en PDF.",
    "Arrastra el PDF aquí o selecciona el archivo": "Glissez le PDF ici ou sélectionnez le fichier",
    "Solo archivos .pdf": "Fichiers .pdf uniquement",
    "Parsear PDF": "Analyser le PDF",
    "Parseando...": "Analyse en cours...",
    "Guardar en Lista 1": "Enregistrer dans Liste 1",
    "Guardar en Lista 2": "Enregistrer dans Liste 2",
    "PRODUCTOS": "PRODUITS",
    "CATEGORÍAS": "CATÉGORIES",
    "PÁGINAS": "PAGES",
    "Buscar por SKU, nombre o categoría...": "Rechercher par SKU, nom ou catégorie...",
    "SKU": "SKU",
    "NOMBRE": "NOM",
    "CATEGORÍA": "CATÉGORIE",
    "PRECIO": "PRIX",
    "Publicar catálogo para todos": "Publier le catalogue pour tous",
    "Sube el JSON a GitHub y actualiza el catálogo en vivo": "Téléverse le JSON sur GitHub et met à jour le catalogue en direct",
    "Destino": "Destination",
    "GitHub Token (PAT)": "Jeton GitHub (PAT)",
    "Publicar para todos": "Publier pour tous",
    "No es un PDF válido": "Ce n'est pas un PDF valide",
    "Ingresa tu GitHub Token (PAT)": "Entrez votre jeton GitHub (PAT)",
    "Subiendo...": "Envoi en cours...",

    // ── Modal Configuración ──
    "Configuración": "Paramètres",
    "API de Inteligencia Artificial": "API d'intelligence artificielle",
    "Google Gemini API Key": "Clé API Google Gemini",
    "¿Cómo obtener mi clave?": "Comment obtenir ma clé ?",
    "Guardar": "Enregistrer",
    "Datos de la Empresa": "Données de l'entreprise",
    "Logo de la cotización": "Logo du devis",
    "Sin logo": "Aucun logo",
    "Subir logo": "Téléverser un logo",
    "Quitar logo": "Retirer le logo",
    "PNG, JPG o SVG · Aparece en el encabezado de cada cotización": "PNG, JPG ou SVG · Apparaît dans l'en-tête de chaque devis",
    "Empresa": "Entreprise",
    "NIT": "NIT",
    "Tel / WhatsApp": "Tél / WhatsApp",
    "Email": "E-mail",
    "Dirección": "Adresse",
    "Datos Bancarios": "Coordonnées bancaires",
    "Banco": "Banque",
    "Tipo de cuenta": "Type de compte",
    "Ahorros": "Épargne",
    "Corriente": "Courant",
    "Número de cuenta": "Numéro de compte",
    "Titular": "Titulaire",
    "Asistente IA — Parámetros": "Assistant IA — Paramètres",
    "El asistente usa esta info para responder preguntas de clientes sobre garantías, horarios, ubicación, etc.": "L'assistant utilise ces infos pour répondre aux questions des clients sur les garanties, horaires, localisation, etc.",
    "Garantía estándar": "Garantie standard",
    "Horarios de atención": "Horaires d'ouverture",
    "Ubicación / Sede": "Emplacement / Site",
    "Formas de pago": "Moyens de paiement",
    "Política de envíos": "Politique d'expédition",
    "Glosario de abreviaturas del catálogo": "Glossaire des abréviations du catalogue",
    "Info adicional para la IA": "Infos supplémentaires pour l'IA",
    "Tutorial": "Tutoriel",
    "ⓘ Ver tutorial de inicio": "ⓘ Voir le tutoriel de démarrage",
    "Administración del sistema": "Administration du système",
    "Modo mantenimiento": "Mode maintenance",
    "Bloquea el acceso a todos excepto al administrador.": "Bloque l'accès à tout le monde sauf à l'administrateur.",
    "Activar": "Activer",
    "Desactivar": "Désactiver",
    "Suspender proyecto": "Suspendre le projet",
    "Bloquea el acceso a todos excepto a administradores y usuarios Pro.": "Bloque l'accès à tout le monde sauf aux administrateurs et utilisateurs Pro.",
    "Marca personalizada": "Marque personnalisée",
    "Cambia la app a la marca ProjectCode para todos los usuarios.": "Passe l'appli à la marque ProjectCode pour tous les utilisateurs.",
    "Anuncios de persuasión (Lite)": "Annonces de conversion (Lite)",
    "Dispara el pop-up de upgrade a todos los asesores Lite en tiempo real, o pruébalo localmente.": "Déclenche la pop-up de mise à niveau à tous les conseillers Lite en temps réel, ou testez-la localement.",
    "Probar local": "Tester en local",
    "Disparar a todos": "Déclencher pour tous",
    "Guardar configuración": "Enregistrer les paramètres",
    "Sin API Key configurada": "Aucune clé API configurée",
    "Eliminar": "Supprimer",
    "Guardando…": "Enregistrement…",

    // ── Modal respuesta sugerida ──
    "Respuesta sugerida": "Réponse suggérée",
    "Edita el texto antes de enviarlo al cliente": "Modifiez le texte avant de l'envoyer au client",
    "Normal": "Normal",
    "Formal": "Formel",
    "Corto": "Court",
    "Detallado": "Détaillé",
    "Generado por IA — puede cometer errores. Revisa el texto antes de enviarlo.": "Généré par IA — peut contenir des erreurs. Vérifiez le texte avant de l'envoyer.",
    "La respuesta aparecerá aquí...": "La réponse apparaîtra ici...",
    "Cerrar": "Fermer",
    "Copiado": "Copié",
    "Copiar respuesta": "Copier la réponse",
    "Generando respuesta…": "Génération de la réponse…",

    // ── Modal texto explicativo ──
    "Texto explicativo": "Texte explicatif",
    "Listo para copiar y pegar en WhatsApp": "Prêt à copier-coller sur WhatsApp",
    "Serio": "Sérieux",
    "Contexto opcional — ej: para estudiantes de colegio, para diseño gráfico…": "Contexte optionnel — ex : pour des élèves, pour du graphisme…",
    "El texto aparecerá aquí...": "Le texte apparaîtra ici...",
    "Generado por IA — revisa antes de enviar.": "Généré par IA — vérifiez avant d'envoyer.",
    "Regenerar": "Régénérer",
    "Generar": "Générer",
    "Copiar texto": "Copier le texte",
    "Generando texto…": "Génération du texte…",

    // ── Modal escanear cotización ──
    "Cotización escaneada → Precios actualizados": "Devis scanné → Prix actualisés",
    "Selecciona los productos a importar con los precios actuales del catálogo": "Sélectionnez les produits à importer avec les prix actuels du catalogue",
    "Producto": "Produit",
    "Precio imagen": "Prix sur l'image",
    "Precio actual": "Prix actuel",
    "Diferencia": "Différence",
    "Cancelar": "Annuler",
    "Importar seleccionados": "Importer la sélection",

    // ── Modal cotización inteligente ──
    "Cotización Inteligente": "Devis intelligent",
    "Productos del cliente → equivalentes en nuestro catálogo": "Produits du client → équivalents dans notre catalogue",
    "Producto cliente → Nuestro equivalente": "Produit client → Notre équivalent",
    "Precio": "Prix",
    "Match": "Correspondance",

    // ── Modal PC builder ──
    "Asistente de Ensambles IA": "Assistant d'assemblage IA",
    "Propuesta de ensamble basada en tu requerimiento y presupuesto": "Proposition d'assemblage basée sur votre besoin et votre budget",
    "Componente": "Composant",
    "Razón / Notas": "Raison / Notes",
    "Agregar a cotización": "Ajouter au devis",

    // ── Tutorial API Key Gemini ──
    "Tu API Key de Gemini": "Votre clé API Gemini",
    "Gratis · Sin tarjeta de crédito": "Gratuit · Sans carte de crédit",
    "Ir a Google AI Studio": "Aller sur Google AI Studio",
    "Abre aistudio.google.com e inicia sesión con tu cuenta Google.": "Ouvrez aistudio.google.com et connectez-vous avec votre compte Google.",
    "Crear la clave": "Créer la clé",
    "Clic en \"Get API key\" → \"Create API key\" → \"Create API key in new project\".": "Cliquez sur « Get API key » → « Create API key » → « Create API key in new project ».",
    "Copiar la clave": "Copier la clé",
    "Copia la clave generada (empieza con AIzaSy...). Guárdala segura, no la compartas.": "Copiez la clé générée (elle commence par AIzaSy...). Gardez-la en sécurité, ne la partagez pas.",
    "Pégala en ProjectCode": "Collez-la dans ProjectCode",
    "Pega la clave en el campo de arriba y presiona \"Guardar\". Solo haces esto una vez por dispositivo.": "Collez la clé dans le champ ci-dessus et cliquez sur « Enregistrer ». Vous ne faites cela qu'une fois par appareil.",
    "PLAN GRATUITO INCLUYE": "LE PLAN GRATUIT INCLUT",
    "500 consultas por día · 15 por minuto / Suficiente para uso profesional diario": "500 requêtes par jour · 15 par minute / Suffisant pour un usage professionnel quotidien",
    "PEGAR API KEY AQUÍ": "COLLER LA CLÉ API ICI",
    "Ir a Google AI Studio": "Aller sur Google AI Studio",
    "Pega tu API Key primero": "Collez d'abord votre clé API",
    "La clave debe empezar con \"AIza...\"": "La clé doit commencer par « AIza... »",

    // ── Modal upgrade a Pro ──
    "Desbloquea todas las funciones": "Débloquez toutes les fonctions",
    "Cotiza más rápido, vende más": "Faites des devis plus vite, vendez plus",
    "Asistente IA — escanear cotización, armar PC, responder cliente": "Assistant IA — scanner un devis, configurer un PC, répondre au client",
    "Generar texto para WhatsApp con IA": "Générer un texte WhatsApp avec l'IA",
    "Historial de cotizaciones": "Historique des devis",
    "Calculadora IVA y Comparar precios": "Calculateur de TVA et comparaison de prix",
    "Facturar al instante desde la cotización": "Facturer instantanément depuis le devis",
    "por mes · cancela cuando quieras": "par mois · annulez quand vous voulez",
    "Hablar por WhatsApp": "Parler sur WhatsApp",
    "Te activamos tu cuenta en minutos": "Nous activons votre compte en quelques minutes",
    "Subir a Pro": "Passer à Pro",
    "Función exclusiva para usuarios Pro": "Fonction exclusive aux utilisateurs Pro",

    // ── AI tour modal ──
    "API Key guardada": "Clé API enregistrée",
    "Ahora conoce las 5 funciones del Asistente IA": "Découvrez maintenant les 5 fonctions de l'Assistant IA",
    "Atrás": "Retour",
    "Siguiente": "Suivant",
    "¡Listo!": "Terminé !",
    "Sube una foto de tu cotización (tuya o de otro asesor) y la IA importa los productos al instante, buscándolos en tu catálogo y aplicando los precios actuales.": "Téléversez une photo de votre devis (le vôtre ou celui d'un autre conseiller) et l'IA importe les produits instantanément, en les cherchant dans votre catalogue et en appliquant les prix actuels.",
    "Útil para no tener que volver a digitar una cotización vieja.": "Utile pour ne pas avoir à retaper un ancien devis.",
    "Sube la cotización de otra tienda y la IA busca equivalentes en tu catálogo. Ideal para responder con tu propia oferta cuando un cliente trae una cotización externa.": "Téléversez le devis d'un autre magasin et l'IA cherche des équivalents dans votre catalogue. Idéal pour répondre avec votre propre offre quand un client apporte un devis externe.",
    "Mientras más clara la foto, mejor el match.": "Plus la photo est nette, meilleure est la correspondance.",
    "Escribe un requerimiento (ej: \"PC para gaming 1080p, $4M\") y la IA propone una configuración completa usando solo productos de tu catálogo activo.": "Écrivez un besoin (ex : « PC gaming 1080p, 4 M$ ») et l'IA propose une configuration complète en utilisant uniquement des produits de votre catalogue actif.",
    "Mientras más específico el requerimiento, mejor la propuesta.": "Plus le besoin est précis, meilleure est la proposition.",
    "Pega la pregunta del cliente y la IA redacta una respuesta amable y profesional. Tiene en cuenta los productos de la cotización actual y la info de tu negocio.": "Collez la question du client et l'IA rédige une réponse aimable et professionnelle. Elle tient compte des produits du devis en cours et des infos de votre entreprise.",
    "Puedes editar la respuesta antes de enviarla.": "Vous pouvez modifier la réponse avant de l'envoyer.",
    "Generar texto de la cotización": "Générer le texte du devis",
    "Una vez armada la cotización, este botón (debajo del documento) genera un mensaje listo para WhatsApp que describe los productos en lenguaje natural.": "Une fois le devis prêt, ce bouton (sous le document) génère un message prêt pour WhatsApp qui décrit les produits en langage naturel.",
    "Elige el tono: normal, serio, corto o detallado.": "Choisissez le ton : normal, sérieux, court ou détaillé.",

    // ── Modal bienvenida asesor ──
    "Bienvenido al Cotizador": "Bienvenue dans le générateur de devis",
    "¿Cuál es tu nombre?": "Quel est votre nom ?",
    "Ej: MARIA, JUAN, CARLOS": "Ex : MARIA, JUAN, CARLOS",
    "Ingresa tu nombre para continuar": "Entrez votre nom pour continuer",
    "Continuar": "Continuer",

    // ── Autenticación ──
    "Verificando acceso...": "Vérification de l'accès...",
    "Bienvenido": "Bienvenue",
    "Inicia sesión para entrar a tu suite de ventas": "Connectez-vous pour accéder à votre suite de ventes",
    "Continuar con Google": "Continuer avec Google",
    "Acceso restringido. Si no tienes permisos, solicítalos al administrador.": "Accès restreint. Si vous n'avez pas les autorisations, demandez-les à l'administrateur.",
    "Solicitud pendiente": "Demande en attente",
    "Tu cuenta aún no está aprobada. Comparte este correo con el administrador para obtener acceso:": "Votre compte n'est pas encore approuvé. Partagez cet e-mail avec l'administrateur pour obtenir l'accès :",
    "Copiar correo": "Copier l'e-mail",
    "Servicio en pausa": "Service en pause",
    "Esta herramienta está temporalmente suspendida. Contacta al administrador para más información.": "Cet outil est temporairement suspendu. Contactez l'administrateur pour plus d'informations.",
    "Sesión cerrada": "Session fermée",
    "Iniciaste sesión en otro dispositivo": "Vous vous êtes connecté sur un autre appareil",
    "Solo se permite una sesión activa por cuenta. Si no fuiste tú, alguien más está usando tu correo.": "Une seule session active est autorisée par compte. Si ce n'était pas vous, quelqu'un d'autre utilise votre e-mail.",
    "Iniciar sesión de nuevo": "Se reconnecter",
    "Página no encontrada": "Page introuvable",
    "La página que buscas no existe o no está disponible.": "La page que vous recherchez n'existe pas ou n'est pas disponible.",

    // ── Admin hub · Usuarios ──
    "Gestiona quién tiene acceso a la suite.": "Gérez qui a accès à la suite.",
    "Solicitudes pendientes": "Demandes en attente",
    "Sin solicitudes": "Aucune demande",
    "Usuarios con acceso": "Utilisateurs avec accès",
    "Añadir por correo": "Ajouter par e-mail",
    "correo@ejemplo.com": "email@exemple.com",
    "Aprueba un correo sin esperar a que la persona inicie sesión.": "Approuvez un e-mail sans attendre que la personne se connecte.",
    "No hay solicitudes pendientes": "Aucune demande en attente",
    "Sin usuarios aprobados": "Aucun utilisateur approuvé",
    "Error al cargar usuarios": "Erreur lors du chargement des utilisateurs",
    "Rechazar": "Rejeter",
    "Aprobar": "Approuver",
    "Lite": "Lite",
    "Basic": "Basic",
    "Pro": "Pro",
    "Quitar": "Retirer",
    "Sin sede": "Sans site",
    "Sede del usuario (para notificaciones de recogidas)": "Site de l'utilisateur (pour les notifications de retraits)",
    "Solicitud rechazada": "Demande rejetée",
    "Mantenimiento activado — solo tú puedes entrar": "Maintenance activée — vous seul pouvez entrer",
    "Mantenimiento desactivado — acceso restaurado": "Maintenance désactivée — accès restauré",
    "Proyecto suspendido — solo Pro pueden entrar": "Projet suspendu — seuls les Pro peuvent entrer",
    "Suspensión desactivada — acceso restaurado": "Suspension désactivée — accès restauré",
    "Marca personalizada activada": "Marque personnalisée activée",
    "Marca personalizada desactivada": "Marque personnalisée désactivée",
    "El archivo debe ser una imagen": "Le fichier doit être une image",
    "La imagen es muy grande. Usa una más pequeña.": "L'image est trop grande. Utilisez-en une plus petite.",
    "Logo cargado · presiona Guardar": "Logo chargé · cliquez sur Enregistrer",
    "Error procesando la imagen": "Erreur lors du traitement de l'image",
    "Escribe el nombre de la marca": "Écrivez le nom de la marque",
    "Marca actualizada": "Marque mise à jour",
    "Anuncio disparado a todos los asesores Lite": "Annonce déclenchée pour tous les conseillers Lite",
    "F5 enviado a todas las sesiones activas": "F5 envoyé à toutes les sessions actives",
    "Email inválido": "E-mail invalide",

    // ── Métricas ──
    "Cotizaciones registradas por vendedor y producto.": "Devis enregistrés par vendeur et produit.",
    "Excluir admin@ejemplo.co": "Exclure admin@ejemplo.co",
    "Recarga la app en todas las sesiones activas": "Recharge l'appli sur toutes les sessions actives",
    "Forzar F5 a todos": "Forcer F5 pour tous",
    "Hoy": "Aujourd'hui",
    "Esta semana": "Cette semaine",
    "Este mes": "Ce mois-ci",
    "Total": "Total",
    "Por vendedor": "Par vendeur",
    "Productos más cotizados": "Produits les plus cotés",
    "Top 10": "Top 10",
    "Búsquedas sin resultados (Faltantes)": "Recherches sans résultat (Manquants)",
    "Sin cotizaciones aún": "Aucun devis pour l'instant",
    "Sin datos": "Aucune donnée",
    "Sin búsquedas fallidas aún": "Aucune recherche infructueuse pour l'instant",
    "veces": "fois",
    "Error al cargar cotizaciones": "Erreur lors du chargement des devis",
    "Error al cargar búsquedas fallidas": "Erreur lors du chargement des recherches infructueuses",

    // ── Importar catálogo JSON ──
    "Importar Catálogo JSON": "Importer un catalogue JSON",
    "Importar catálogo desde JSON del parser PDF": "Importer le catalogue depuis le JSON de l'analyseur PDF",
    "Destino:": "Destination :",
    "Store": "Store",
    "Lago": "Lago",
    "Arrastra un archivo .json aquí": "Glissez un fichier .json ici",
    "o haz clic para seleccionar": "ou cliquez pour sélectionner",
    "Seleccionar archivo JSON de catálogo": "Sélectionner un fichier JSON de catalogue",
    "Esperando archivo...": "En attente d'un fichier...",
    "Los precios en COP se convertirán automáticamente a miles de COP": "Les prix en COP seront automatiquement convertis en milliers de COP",
    "Subir a GitHub (opcional)": "Téléverser sur GitHub (optionnel)",
    "Token PAT": "Jeton PAT",
    "Recordar token": "Mémoriser le jeton",
    "Nombre de archivo": "Nom du fichier",
    "Descargar JSON": "Télécharger le JSON",
    "Subir a GitHub": "Téléverser sur GitHub",
    "Mostrar/ocultar token": "Afficher/masquer le jeton",
    "Confirmar importación": "Confirmer l'importation",
    "Solo se aceptan archivos .json": "Seuls les fichiers .json sont acceptés",
    "Analizando archivo...": "Analyse du fichier...",
    "Categoría": "Catégorie",
    "Importando...": "Importation...",
    "Importando catálogo...": "Importation du catalogue...",
    "Importado": "Importé",
    "Módulo de subida no disponible": "Module de téléversement indisponible",
    "Ingresa un token PAT de GitHub": "Entrez un jeton PAT GitHub",
    "No hay contenido de archivo para subir": "Aucun contenu de fichier à téléverser",
    "Subiendo a GitHub...": "Envoi vers GitHub...",
    "Subido": "Envoyé",
    "Reintentar": "Réessayer",
    "Importa el catálogo primero": "Importez d'abord le catalogue",

    // ── Recogidas / Remisiones ──
    "Avisos del navegador activados": "Notifications du navigateur activées",
    "Avisos del navegador no activados": "Notifications du navigateur non activées",
    "Ver": "Voir",
    "Comunicación entre sedes": "Communication entre sites",
    "Registra ventas que el cliente recoge en otra sede. La sede destino recibe la notificación al instante.": "Enregistrez les ventes que le client récupère dans un autre site. Le site destinataire reçoit la notification instantanément.",
    "¿Cómo funciona?": "Comment ça marche ?",
    "Vendes desde:": "Vous vendez depuis :",
    "El cliente recoge en:": "Le client récupère à :",
    "Activa los avisos del navegador para enterarte de nuevas recogidas aunque estés en otra pestaña.": "Activez les notifications du navigateur pour être averti des nouveaux retraits même sur un autre onglet.",
    "Activar avisos": "Activer les notifications",
    "Nueva recogida": "Nouveau retrait",
    "Usar cotización actual": "Utiliser le devis actuel",
    "Nombre del cliente *": "Nom du client *",
    "WhatsApp / Teléfono": "WhatsApp / Téléphone",
    "Producto(s) que recoge * — uno por línea": "Produit(s) à récupérer * — un par ligne",
    "Observaciones (pago, hora estimada, etc.)": "Observations (paiement, heure estimée, etc.)",
    "Adjuntar imagen": "Joindre une image",
    "Imagen adjunta": "Image jointe",
    "Orden de pedido, comprobante de pago… también puedes arrastrarla directamente aquí.": "Bon de commande, preuve de paiement… vous pouvez aussi la glisser directement ici.",
    "Registrar recogida": "Enregistrer le retrait",
    "Tablero de recogidas": "Tableau des retraits",
    "Activas": "Actifs",
    "Recogen aquí": "À récupérer ici",
    "Enviadas por mi sede": "Envoyés par mon site",
    "Todas": "Tous",
    "Historial de entregas": "Historique des livraisons",
    "Borrar todas las entregadas": "Supprimer tous les livrés",
    "Visible para todo el equipo. Por seguridad, cada entrega se conserva 30 días y luego se borra automáticamente.": "Visible pour toute l'équipe. Par sécurité, chaque livraison est conservée 30 jours puis supprimée automatiquement.",
    "No hay recogidas pendientes": "Aucun retrait en attente",
    "Pendiente": "En attente",
    "Preparado": "Préparé",
    "Entregado": "Livré",
    "Marcar preparado": "Marquer comme préparé",
    "Entregar al cliente": "Livrer au client",
    "Recogida local": "Retrait local",
    "Cliente sin nombre": "Client sans nom",
    "Clic para cerrar": "Cliquez pour fermer",
    "ahora mismo": "à l'instant",
    "Escribe el nombre del cliente": "Écrivez le nom du client",
    "Escribe qué producto(s) recoge": "Écrivez quel(s) produit(s) il récupère",
    "Elige desde qué sede vendes": "Choisissez depuis quel site vous vendez",
    "Elige la sede donde el cliente recoge": "Choisissez le site où le client récupère",
    "Enviando…": "Envoi en cours…",
    "No hay recogidas entregadas para borrar": "Aucun retrait livré à supprimer",
    "Recogidas entregadas eliminadas": "Retraits livrés supprimés",
    "La cotización actual está vacía": "Le devis actuel est vide",
    "Datos copiados de la cotización actual": "Données copiées depuis le devis actuel",
    "Error al cargar recogidas — revisa los permisos de Firestore (colección «remisiones»)": "Erreur lors du chargement des retraits — vérifiez les permissions Firestore (collection « remisiones »)",

    // ── Tour Recogidas ──
    "Recogidas entre sedes": "Retraits entre sites",
    "Cuando un cliente compra en tu sede pero recoge en otra, regístralo aquí. La otra sede se entera al instante — sin WhatsApp ni llamadas.": "Quand un client achète dans votre site mais récupère dans un autre, enregistrez-le ici. L'autre site est averti instantanément — sans WhatsApp ni appels.",
    "Tu sede": "Votre site",
    "Esta es la sede que tienes asignada. Recibirás una notificación con sonido cada vez que alguien registre una recogida para tu sede.": "C'est le site qui vous est assigné. Vous recevrez une notification sonore chaque fois que quelqu'un enregistre un retrait pour votre site.",
    "Registrar una recogida": "Enregistrer un retrait",
    "Llena los datos del cliente y qué productos recoge. Puedes adjuntar la orden de pedido o el comprobante de pago como imagen.": "Remplissez les infos du client et les produits qu'il récupère. Vous pouvez joindre le bon de commande ou la preuve de paiement en image.",
    "Ahórrate digitar": "Évitez de retaper",
    "Si la venta salió de una cotización que hiciste aquí mismo, este botón copia el cliente, el WhatsApp y los productos automáticamente.": "Si la vente provient d'un devis que vous avez fait ici même, ce bouton copie automatiquement le client, le WhatsApp et les produits.",
    "Dónde recoge el cliente": "Où le client récupère",
    "Elige la sede de recogida y presiona el botón. En ese momento todos en esa sede reciben el aviso — no hace falta avisarle a nadie más.": "Choisissez le site de retrait et cliquez sur le bouton. À ce moment, tout le monde sur ce site reçoit l'alerte — inutile de prévenir qui que ce soit d'autre.",
    "«Recogen aquí» muestra lo que tu sede debe alistar. «Enviadas por mi sede» muestra tus ventas en camino y en qué estado van.": "« À récupérer ici » montre ce que votre site doit préparer. « Envoyés par mon site » montre vos ventes en cours et leur statut.",
    "Preparado y entregado": "Préparé et livré",
    "Cuando alistes el pedido marca «Preparado», y al entregarlo al cliente marca «Entregado». El vendedor recibe aviso en cada paso, y las recogidas con más de un día en espera se resaltan en rojo.": "Quand vous préparez la commande, marquez « Préparé », et en la livrant au client, marquez « Livré ». Le vendeur est averti à chaque étape, et les retraits en attente depuis plus d'un jour sont surlignés en rouge.",

    // ── Tour onboarding general ──
    "Total en tiempo real": "Total en temps réel",
    "Aquí ves el total de la cotización actualizado al instante. También puedes aplicar descuento y retefuente.": "Ici vous voyez le total du devis mis à jour instantanément. Vous pouvez aussi appliquer une remise et une retenue à la source.",
    "Cargar lista de precios": "Charger la liste de prix",
    "Primero sube tu catálogo JSON (Store o Lago). Sin esto, el catálogo y el escáner no podrán funcionar. Haz clic en \"Store\" o \"Lago\" para cargar el archivo.": "Téléversez d'abord votre catalogue JSON (Store ou Lago). Sans cela, le catalogue et le scanner ne fonctionneront pas. Cliquez sur « Store » ou « Lago » pour charger le fichier.",
    "Catálogo de productos": "Catalogue de produits",
    "Busca en el catálogo Store o Lago por nombre o SKU. Haz clic en cualquier producto para añadirlo a la cotización.": "Recherchez dans le catalogue Store ou Lago par nom ou SKU. Cliquez sur un produit pour l'ajouter au devis.",
    "Sube una foto de tu cotización y la IA la importa con los precios actuales del catálogo. Para cotizar productos de otra tienda usa \"Cotizar competencia\".": "Téléversez une photo de votre devis et l'IA l'importe avec les prix actuels du catalogue. Pour coter des produits d'un autre magasin, utilisez « Devis concurrent ».",
    "Lista de productos": "Liste de produits",
    "Los productos añadidos aparecen aquí. Puedes cambiar cantidades, categorías, agregar notas o eliminarlos.": "Les produits ajoutés apparaissent ici. Vous pouvez changer les quantités, catégories, ajouter des notes ou les supprimer.",
    "Copiar como imagen": "Copier comme image",
    "Genera la cotización y cópiala como imagen lista para enviar por WhatsApp o correo.": "Générez le devis et copiez-le en image prête à envoyer par WhatsApp ou e-mail.",
    "Todas tus cotizaciones se guardan automáticamente aquí. Puedes restaurar cualquiera con un clic.": "Tous vos devis sont enregistrés automatiquement ici. Vous pouvez en restaurer n'importe lequel en un clic.",
    "Configura tu API Key de IA, datos de empresa y datos bancarios para las cotizaciones.": "Configurez votre clé API IA, les données de l'entreprise et les coordonnées bancaires pour les devis.",
    "Saltar": "Passer",
    "Anterior": "Précédent",
    "Siguiente": "Suivant",
    "Finalizar": "Terminer",

    // ── Toasts / alerts genéricos ──
    "Producto sin nombre — no se puede agregar": "Produit sans nom — impossible à ajouter",
    "Edita el precio del Servicio Técnico (clic en el precio)": "Modifiez le prix du Service Technique (cliquez sur le prix)",
    "Función solo disponible en plan Lite": "Fonction disponible uniquement dans le plan Lite",
    "No hay productos parseados todavía": "Aucun produit analysé pour l'instant",
    "No se pudo guardar (sin espacio en el navegador)": "Impossible d'enregistrer (plus d'espace dans le navigateur)",
    "Lista 2 vacía — súbela en el Parser PDF primero": "Liste 2 vide — téléversez-la d'abord dans l'analyseur PDF",
    "No se puede activar Lista 2 — hay productos de Lista 1 en el carrito": "Impossible d'activer la Liste 2 — il y a des produits de la Liste 1 dans le panier",
    "El texto está vacío": "Le texte est vide",
    "No se reconoció ningún producto. Formato esperado: SKU NOMBRE PRECIO": "Aucun produit reconnu. Format attendu : SKU NOM PRIX",
    "Agrega productos al catálogo primero": "Ajoutez d'abord des produits au catalogue",
    "Sin conexión a internet": "Pas de connexion internet",
    "API Key inválida — verifica en Ajustes": "Clé API invalide — vérifiez dans les Paramètres",
    "Demasiadas solicitudes — espera un momento e intenta de nuevo": "Trop de requêtes — attendez un instant et réessayez",
    "Demasiadas solicitudes — espera un momento": "Trop de requêtes — attendez un instant",
    "Imagen muy grande — usa una de menos de 5 MB": "Image trop grande — utilisez-en une de moins de 5 Mo",
    "Imagen muy grande — usa menos de 5 MB": "Image trop grande — utilisez moins de 5 Mo",
    "Error en servidor de Gemini — intenta en unos segundos": "Erreur du serveur Gemini — réessayez dans quelques secondes",
    "Error de red — verifica tu conexión": "Erreur réseau — vérifiez votre connexion",
    "Respuesta inesperada de la API — intenta con otra imagen": "Réponse inattendue de l'API — essayez avec une autre image",
    "Error desconocido al analizar la imagen": "Erreur inconnue lors de l'analyse de l'image",
    "Error desconocido": "Erreur inconnue",
    "Selecciona al menos un producto": "Sélectionnez au moins un produit",
    "Selecciona al menos un componente": "Sélectionnez au moins un composant",
    "Escribe un requerimiento para armar el PC": "Écrivez un besoin pour configurer le PC",
    "La IA eligió productos que no existen en el catálogo": "L'IA a choisi des produits qui n'existent pas dans le catalogue",
    "Historial lleno — se borraron cotizaciones viejas para guardar la nueva.": "Historique plein — d'anciens devis ont été supprimés pour enregistrer le nouveau.",
    "No se pudo guardar: almacenamiento del navegador lleno. Libera espacio o borra historial.": "Impossible d'enregistrer : stockage du navigateur plein. Libérez de l'espace ou effacez l'historique.",
    "Historial con mezcla Lista 1/Lista 2. Revísalo antes de usarlo.": "Historique mélangeant Liste 1/Liste 2. Vérifiez-le avant de l'utiliser.",
    "Historial con mezcla Lista 1/Lista 2. Revísalo antes de duplicarlo.": "Historique mélangeant Liste 1/Liste 2. Vérifiez-le avant de le dupliquer.",
    "Cotización duplicada — asigna nuevo cliente": "Devis dupliqué — assignez un nouveau client",
    "¿Borrar todo el historial?": "Supprimer tout l'historique ?",
    "No hay productos": "Aucun produit",
    "Genera la cotización primero.": "Générez d'abord le devis.",
    "Genera la cotización primero": "Générez d'abord le devis",
    "Imagen descargada": "Image téléchargée",
    "Imagen copiada": "Image copiée",
    "No se pudo generar la imagen": "Impossible de générer l'image",
    "Función no disponible sin conexión": "Fonction indisponible hors connexion",
    "Imagen muy grande, intenta con una más pequeña": "Image trop grande, essayez-en une plus petite",
    "Logo guardado": "Logo enregistré",
    "Logo eliminado": "Logo supprimé",
    "Pega la pregunta del cliente primero": "Collez d'abord la question du client",
    "Error al consultar Gemini": "Erreur lors de la requête à Gemini",
    "Agrega productos a la cotización primero": "Ajoutez d'abord des produits au devis",
    "Precio actualizado": "Prix mis à jour",
    "Nombre actualizado": "Nom mis à jour",
    "Descripción actualizada": "Description mise à jour",
    "Escribe un nombre para el producto": "Écrivez un nom pour le produit",
    "Escribe un precio válido": "Écrivez un prix valide"
  };

  // Patrones para mensajes dinámicos (contadores, toasts con variables).
  // Cada uno intenta sobre el texto ya recortado (trim) del nodo/atributo.
  var FR_PATTERNS = [
    { re: /^Activar Lista\s+(.+)$/, fr: function (m) { return 'Activer la liste ' + m[1]; } },
    { re: /^(\d+)\s+productos$/, fr: function (m) { return m[1] + ' produits'; } },
    { re: /^(\d+)\s+seleccionados$/, fr: function (m) { return m[1] + ' sélectionnés'; } },
    { re: /^Paso\s+(\d+)\s+de\s+(\d+)$/, fr: function (m) { return 'Étape ' + m[1] + ' sur ' + m[2]; } },
    { re: /^Tip:\s*([\s\S]+)$/, fr: function (m) { return 'Astuce : ' + m[1]; } },
    { re: /^Error:\s*([\s\S]*)$/, fr: function (m) { return 'Erreur : ' + m[1]; } },
    { re: /^✓\s*(.+?)\s+aprobado$/, fr: function (m) { return '✓ ' + m[1] + ' approuvé'; } },
    { re: /^✓\s*(.+?)\s+asignado a\s+(.+)$/, fr: function (m) { return '✓ ' + m[1] + ' assigné à ' + m[2]; } },
    { re: /^(.+?)\s+quedó sin sede$/, fr: function (m) { return m[1] + ' est resté sans site'; } },
    { re: /^(.+?)\s+removido$/, fr: function (m) { return m[1] + ' supprimé'; } },
    { re: /^✦\s*(.+?)\s+es ahora Pro$/, fr: function (m) { return '✦ ' + m[1] + ' est maintenant Pro'; } },
    { re: /^(.+?)\s+cambiado a Lite$/, fr: function (m) { return m[1] + ' changé en Lite'; } },
    { re: /^(.+?)\s+cambiado a Basic$/, fr: function (m) { return m[1] + ' changé en Basic'; } },
    { re: /^¿Rechazar la solicitud de\s+(.+)\?$/, fr: function (m) { return 'Rejeter la demande de ' + m[1] + ' ?'; } },
    { re: /^¿Quitar acceso a\s+(.+)\?([\s\S]*)No podrá entrar a la app hasta que lo vuelvas a aprobar\.$/, fr: function (m) { return 'Retirer l\'accès à ' + m[1] + ' ?' + m[2] + 'Il ne pourra pas entrer dans l\'appli tant que vous ne l\'aurez pas de nouveau approuvé.'; } },
    { re: /^SKU\s+(.+?)\s+copiado\s*—\s*Ctrl\+F y Ctrl\+V en la hoja$/, fr: function (m) { return 'SKU ' + m[1] + ' copié — Ctrl+F et Ctrl+V dans la feuille'; } },
    { re: /^✓\s*SKU copiado:\s*(.+)$/, fr: function (m) { return '✓ SKU copié : ' + m[1]; } },
    { re: /^✓\s*(.+?)\s+copiado$/, fr: function (m) { return '✓ ' + m[1] + ' copié'; } },
    { re: /^Desglose copiado\s*\((\d+)\s+líneas\)$/, fr: function (m) { return 'Détail copié (' + m[1] + ' lignes)'; } },
    { re: /^(?:✅\s*)?(\d+)\s+precios copiados$/, fr: function (m) { return m[1] + ' prix copiés'; } },
    { re: /^(?:✅\s*)?(\d+)\s+filas copiadas para SIIGO$/, fr: function (m) { return m[1] + ' lignes copiées pour SIIGO'; } },
    { re: /^✓\s*CSV descargado$/, fr: function () { return '✓ CSV téléchargé'; } },
    { re: /^✓\s*(\d+)\s+productos guardados en\s+(.+)$/, fr: function (m) { return '✓ ' + m[1] + ' produits enregistrés dans ' + m[2]; } },
    { re: /^Lista 2 activada\s*·\s*(\d+)\s+productos$/, fr: function (m) { return 'Liste 2 activée · ' + m[1] + ' produits'; } },
    { re: /^(?:✅\s*)?(.+?):\s*(\d+)\s+productos cargados$/, fr: function (m) { return m[1] + ' : ' + m[2] + ' produits chargés'; } },
    { re: /^(?:✅\s*)?(.+?)\s+cargada\s*\((\d+)\)\s*·\s*cambio bloqueado por carrito en\s+(.+)$/, fr: function (m) { return m[1] + ' chargée (' + m[2] + ') · changement bloqué par le panier dans ' + m[3]; } },
    { re: /^(?:✅\s*)?(\d+)\s+productos importados con precios actuales$/, fr: function (m) { return m[1] + ' produits importés avec les prix actuels'; } },
    { re: /^(?:✅\s*)?(\d+)\s+productos importados desde cotización inteligente$/, fr: function (m) { return m[1] + ' produits importés depuis le devis intelligent'; } },
    { re: /^(?:✅\s*)?(\d+)\s+componentes agregados$/, fr: function (m) { return m[1] + ' composants ajoutés'; } },
    { re: /^(\d+)\s+componentes sugeridos$/, fr: function (m) { return m[1] + ' composants suggérés'; } },
    { re: /^Total aprox:\s*(.+)$/, fr: function (m) { return 'Total approx. : ' + m[1]; } },
    { re: /^Nueva cotización #(\d+) iniciada$/, fr: function (m) { return 'Nouveau devis #' + m[1] + ' démarré'; } },
    { re: /^✓\s*Capturado como\s+(.+)$/, fr: function (m) { return '✓ Capturé comme ' + m[1]; } },
    { re: /^(\d+)\s+productos en imagen$/, fr: function (m) { return m[1] + ' produits sur l\'image'; } },
    { re: /^✓\s*(\d+)\s+exacto\(s\)$/, fr: function (m) { return '✓ ' + m[1] + ' exact(s)'; } },
    { re: /^(?:🔄\s*)?(\d+)\s+equivalente\(s\)$/, fr: function (m) { return m[1] + ' équivalent(s)'; } },
    { re: /^✕\s*(\d+)\s+sin match$/, fr: function (m) { return '✕ ' + m[1] + ' sans correspondance'; } },
    { re: /^(\d+)\s+productos en\s+(\d+)\s+categorías$/, fr: function (m) { return m[1] + ' produits en ' + m[2] + ' catégories'; } },
    { re: /^\.\.\. y\s+(\d+)\s+categorías más$/, fr: function (m) { return '... et ' + m[1] + ' catégories de plus'; } },
    { re: /^Listo para importar\s*—\s*(\d+)\s+productos encontrados$/, fr: function (m) { return 'Prêt à importer — ' + m[1] + ' produits trouvés'; } },
    { re: /^Importado:\s*(\d+)\s+productos\s*\((\d+)\s+categorías\)$/, fr: function (m) { return 'Importé : ' + m[1] + ' produits (' + m[2] + ' catégories)'; } },
    { re: /^Subido a GitHub:\s*(.+)$/, fr: function (m) { return 'Envoyé sur GitHub : ' + m[1]; } },
    { re: /^Catálogo subido a GitHub\s*\((.+)\)$/, fr: function (m) { return 'Catalogue envoyé sur GitHub (' + m[1] + ')'; } },
    { re: /^Error al subir:\s*([\s\S]*)$/, fr: function (m) { return 'Erreur lors de l\'envoi : ' + m[1]; } },
    { re: /^Fuente:\s*(.+)$/, fr: function (m) { return 'Source : ' + m[1]; } },
    { re: /^Fecha:\s*(.+)$/, fr: function (m) { return 'Date : ' + m[1]; } },
    { re: /^Método:\s*(.+)$/, fr: function (m) { return 'Méthode : ' + m[1]; } },
    { re: /^Buscado por:\s*(.+)$/, fr: function (m) { return 'Recherché par : ' + m[1]; } },
    { re: /^ahora mismo$/, fr: function () { return 'à l\'instant'; } },
    { re: /^hace\s+(\d+)\s+min$/, fr: function (m) { return 'il y a ' + m[1] + ' min'; } },
    { re: /^hace\s+(\d+)\s+h$/, fr: function (m) { return 'il y a ' + m[1] + ' h'; } },
    { re: /^hace\s+(\d+)\s+día(s)?$/, fr: function (m) { return 'il y a ' + m[1] + ' jour' + (m[1] === '1' ? '' : 's'); } },
    { re: /^Registró:\s*(.+?)\s*\((.+)\)$/, fr: function (m) { return 'Enregistré par : ' + m[1] + ' (' + m[2] + ')'; } },
    { re: /^Preparó:\s*(.+)$/, fr: function (m) { return 'Préparé par : ' + m[1]; } },
    { re: /^Entregó:\s*(.+)$/, fr: function (m) { return 'Livré par : ' + m[1]; } },
    { re: /^¿Eliminar esta recogida definitivamente\?$/, fr: function () { return 'Supprimer définitivement ce retrait ?'; } },
    { re: /^¿Eliminar las\s+(\d+)\s+recogidas entregadas\? Esta acción no se puede deshacer\.$/, fr: function (m) { return 'Supprimer les ' + m[1] + ' retraits livrés ? Cette action est irréversible.'; } },
    { re: /^Error al eliminar:\s*([\s\S]*)$/, fr: function (m) { return 'Erreur de suppression : ' + m[1]; } },
    { re: /^Error al enviar:\s*([\s\S]*)$/, fr: function (m) { return 'Erreur d\'envoi : ' + m[1]; } },
    { re: /^¿Confirmas que el cliente ya recibió sus productos\?$/, fr: function () { return 'Confirmez-vous que le client a bien reçu ses produits ?'; } },
    { re: /^✓\s*Entregado al cliente$/, fr: function () { return '✓ Livré au client'; } },
    { re: /^✓\s*Marcado como preparado$/, fr: function () { return '✓ Marqué comme préparé'; } },
    { re: /^Ya hay una recogida activa de\s*"(.+?)"\s*en\s+(.+?)\.([\s\S]*)¿Registrar otra de todas formas\?$/, fr: function (m) { return 'Il y a déjà un retrait actif de « ' + m[1] + ' » sur ' + m[2] + '.' + m[3] + 'Enregistrer quand même un autre ?'; } },
    { re: /^✓\s*Recogida local registrada\s*—\s*quedó en el tablero de\s+(.+)$/, fr: function (m) { return '✓ Retrait local enregistré — ajouté au tableau de ' + m[1]; } },
    { re: /^✓\s*Recogida registrada\s*—\s*(.+?)\s*ya fue notificada$/, fr: function (m) { return '✓ Retrait enregistré — ' + m[1] + ' a été notifié'; } },
    { re: /^Nueva recogida en\s+(.+)$/, fr: function (m) { return 'Nouveau retrait sur ' + m[1]; } },
    { re: /^Tu recogida de\s+(.+?)\s+ya está preparada en\s+(.+)$/, fr: function (m) { return 'Votre retrait de ' + m[1] + ' est prêt sur ' + m[2]; } },
    { re: /^✓\s*Tu recogida de\s+(.+?)\s+fue entregada al cliente$/, fr: function (m) { return '✓ Votre retrait de ' + m[1] + ' a été livré au client'; } },
    { re: /^No tienes sede asignada — pídele al administrador que te asigne una para recibir notificaciones\.$/, fr: function () { return 'Vous n\'avez pas de site assigné — demandez à l\'administrateur de vous en assigner un pour recevoir des notifications.'; } },
    { re: /^Administrador\s*—\s*recibes las recogidas de todas las sedes$/, fr: function () { return 'Administrateur — vous recevez les retraits de tous les sites'; } },
    { re: /^·\s*registras desde\s+(.+)$/, fr: function (m) { return '· vous enregistrez depuis ' + m[1]; } },
    { re: /^Tu sede:\s*(.+)$/, fr: function (m) { return 'Votre site : ' + m[1]; } },
    { re: /^·\s*aquí$/, fr: function () { return '· ici'; } }
  ];

  var translatedText = new WeakMap(); // Text node -> texto original
  var currentLang = 'es';
  var pendingWalk = null;

  function frFor(trimmed) {
    if (!trimmed) return null;
    var fr = FR_DICT[trimmed];
    if (fr) return fr;
    for (var i = 0; i < FR_PATTERNS.length; i++) {
      var m = trimmed.match(FR_PATTERNS[i].re);
      if (m) return FR_PATTERNS[i].fr(m);
    }
    return null;
  }

  // Traduce un string suelto (para alert/confirm/prompt, que no viven en el DOM).
  function translateString(full) {
    if (currentLang !== 'fr' || typeof full !== 'string') return full;
    var trimmed = full.trim();
    if (!trimmed) return full;
    var fr = frFor(trimmed);
    return fr ? full.replace(trimmed, fr) : full;
  }

  function isNeverTranslate(el) {
    while (el) {
      if (el.nodeType === 1) {
        if (NEVER_TRANSLATE_IDS.indexOf(el.id) !== -1) return true;
        if (el.tagName === 'IFRAME' || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return true;
        if (el.classList && el.classList.contains('no-i18n')) return true;
      }
      el = el.parentElement;
    }
    return false;
  }

  function translateAttr(el, attr) {
    var storedAttr = 'data-i18norig-' + attr;
    if (currentLang === 'fr') {
      var cur = el.getAttribute(attr);
      if (!cur) return;
      var trimmed = cur.trim();
      var fr = frFor(trimmed);
      if (fr && !el.hasAttribute(storedAttr)) {
        el.setAttribute(storedAttr, cur);
        el.setAttribute(attr, cur.replace(trimmed, fr));
      }
    } else {
      if (el.hasAttribute(storedAttr)) {
        el.setAttribute(attr, el.getAttribute(storedAttr));
        el.removeAttribute(storedAttr);
      }
    }
  }

  function translateTextNode(node) {
    var full = node.textContent;
    if (currentLang === 'fr') {
      if (translatedText.has(node)) return;
      var trimmed = full.trim();
      if (!trimmed) return;
      var fr = frFor(trimmed);
      if (fr) {
        translatedText.set(node, full);
        node.textContent = full.replace(trimmed, fr);
      }
    } else {
      if (translatedText.has(node)) {
        node.textContent = translatedText.get(node);
        translatedText.delete(node);
      }
    }
  }

  function walk(root) {
    if (!root || isNeverTranslate(root)) return;
    if (root.nodeType === 1) {
      translateAttr(root, 'placeholder');
      translateAttr(root, 'title');
      if (root.tagName === 'BUTTON' || (root.tagName === 'INPUT' && (root.type === 'button' || root.type === 'submit'))) {
        translateAttr(root, 'value');
      }
      var child = root.firstChild;
      while (child) { walk(child); child = child.nextSibling; }
    } else if (root.nodeType === 3) {
      translateTextNode(root);
    }
  }

  function scheduleWalk() {
    if (pendingWalk) return;
    pendingWalk = setTimeout(function () {
      pendingWalk = null;
      walk(document.body);
    }, 150);
  }

  function updateButton() {
    // El ícono de globo (SVG en #btnLangFlag) es neutro: solo cambia el label.
    var lbl = document.getElementById('btnLangLbl');
    if (!lbl) return;
    lbl.textContent = (currentLang === 'fr') ? 'FR' : 'ES';
  }

  function setAppLang(lang) {
    currentLang = (lang === 'fr') ? 'fr' : 'es';
    try { localStorage.setItem(STORAGE_KEY, currentLang); } catch (e) {}
    walk(document.body);
    updateButton();
  }

  window._toggleAppLang = function () {
    setAppLang(currentLang === 'fr' ? 'es' : 'fr');
  };

  // alert()/confirm()/prompt() son diálogos nativos del navegador: no viven
  // en el DOM, así que el walk() de arriba no los alcanza. Se interceptan
  // aparte para traducir su mensaje cuando el idioma activo es francés.
  var _origAlert = window.alert;
  var _origConfirm = window.confirm;
  var _origPrompt = window.prompt;
  window.alert = function (msg) { return _origAlert.call(window, translateString(msg)); };
  window.confirm = function (msg) { return _origConfirm.call(window, translateString(msg)); };
  window.prompt = function (msg, def) { return _origPrompt.call(window, translateString(msg), def); };

  function init() {
    var saved = 'es';
    try { saved = localStorage.getItem(STORAGE_KEY) || 'es'; } catch (e) {}
    currentLang = (saved === 'fr') ? 'fr' : 'es';
    updateButton();
    if (currentLang === 'fr') walk(document.body);

    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        if (!isNeverTranslate(mutations[i].target)) { scheduleWalk(); return; }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title'] });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
