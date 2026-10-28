/**
 * Traducciones de la base de recetas (inglés, francés y portugués de Brasil).
 * Textos y palabras clave por receta; el orden de `ingredients` y `match`
 * es el mismo que el de la receta original en español.
 */
export interface RecipeText {
  title: string;
  /** Nombre visible de cada ingrediente, en el mismo orden que la receta. */
  ingredients: string[];
  steps: string[];
  /** Palabras clave extra para reconocer los productos en ese idioma (normalizadas: minúsculas y sin acentos), en el mismo orden que los ingredientes. */
  match: string[][];
}

export type RecipeLocale = 'en' | 'fr' | 'pt';

// Palabras clave compartidas por idioma.
const EN = {
  salt: ['salt'],
  water: ['water'],
  oil: ['oil', 'olive oil'],
  egg: ['egg', 'eggs'],
  potato: ['potato', 'potatoes'],
  onion: ['onion', 'onions'],
  rice: ['rice'],
  pepper: ['bell pepper', 'bell peppers', 'capsicum', 'red pepper', 'red peppers', 'green pepper', 'green peppers'],
  zucchini: ['zucchini', 'zucchinis', 'courgette', 'courgettes'],
  carrot: ['carrot', 'carrots'],
  tomato: ['tomato', 'tomatoes'],
  cheese: ['cheese', 'cheeses'],
  garlic: ['garlic'],
  chicken: ['chicken'],
  lemon: ['lemon', 'lemons'],
  bread: ['bread', 'loaf', 'baguette'],
};

const FR = {
  salt: ['sel'],
  water: ['eau'],
  oil: ['huile', 'huile d olive'],
  egg: ['oeuf', 'oeufs'],
  potato: ['pomme de terre', 'pommes de terre', 'patate', 'patates'],
  onion: ['oignon', 'oignons'],
  rice: ['riz'],
  pepper: ['poivron', 'poivrons'],
  zucchini: ['courgette', 'courgettes'],
  carrot: ['carotte', 'carottes'],
  tomato: ['tomate', 'tomates'],
  cheese: ['fromage', 'fromages', 'emmental', 'gruyere', 'parmesan'],
  garlic: ['ail'],
  chicken: ['poulet', 'volaille'],
  lemon: ['citron', 'citrons'],
  bread: ['pain', 'pains', 'baguette'],
};

const PT = {
  salt: ['sal'],
  water: ['agua'],
  oil: ['azeite', 'oleo'],
  egg: ['ovo', 'ovos'],
  potato: ['batata', 'batatas'],
  onion: ['cebola', 'cebolas'],
  rice: ['arroz'],
  pepper: ['pimentao', 'pimentoes'],
  zucchini: ['abobrinha', 'abobrinhas'],
  carrot: ['cenoura', 'cenouras'],
  tomato: ['tomate', 'tomates'],
  cheese: ['queijo', 'queijos', 'parmesao'],
  garlic: ['alho'],
  chicken: ['frango'],
  lemon: ['limao', 'limoes'],
  bread: ['pao', 'paes'],
};

export const RECIPE_TRANSLATIONS: Record<RecipeLocale, Record<string, RecipeText>> = {
  en: {
    'tortilla-patatas': {
      title: 'Spanish potato omelette (tortilla)',
      ingredients: ['Eggs (5)', 'Potatoes (600 g)', 'Onion', 'Olive oil', 'Salt'],
      steps: [
        'Peel the potatoes (and the onion, if using) and cut them into thin slices.',
        'Fry them over medium heat in plenty of oil until tender. Drain.',
        'Beat the eggs with salt and mix them with the potatoes.',
        'Cook the mixture in a pan with a little oil, flip it using a plate and finish cooking the other side.',
      ],
      match: [EN.egg, EN.potato, EN.onion, EN.oil, EN.salt],
    },
    'arroz-verduras': {
      title: 'Vegetable fried rice',
      ingredients: ['Rice (250 g)', 'Bell pepper', 'Zucchini', 'Carrot', 'Egg', 'Olive oil', 'Salt', 'Water'],
      steps: [
        'Boil the rice in salted water and drain it.',
        'Dice the vegetables and sauté them in a pan with oil.',
        'Add the rice and, if you like, a beaten egg. Stir over high heat for a couple of minutes.',
      ],
      match: [EN.rice, EN.pepper, EN.zucchini, EN.carrot, EN.egg, EN.oil, EN.salt, EN.water],
    },
    lentejas: {
      title: 'Spanish lentil stew',
      ingredients: ['Lentils (300 g)', 'Carrot', 'Onion', 'Potato', 'Paprika', 'Olive oil', 'Salt', 'Water'],
      steps: [
        'Sauté the chopped onion and carrot in oil.',
        'Add a teaspoon of paprika, the lentils and enough water to cover them well.',
        'Simmer for about 35-40 minutes (add the diced potato halfway through). Season with salt at the end.',
      ],
      match: [['lentil', 'lentils'], EN.carrot, EN.onion, EN.potato, ['paprika'], EN.oil, EN.salt, EN.water],
    },
    'pasta-tomate': {
      title: 'Pasta with tomato sauce',
      ingredients: ['Pasta (200 g)', 'Crushed tomatoes or tomato sauce', 'Grated cheese', 'Garlic', 'Olive oil', 'Salt', 'Water'],
      steps: [
        'Cook the pasta in salted water for the time shown on the package.',
        'Meanwhile, heat the tomato in a pan with a little oil (and chopped garlic, if you like).',
        'Toss the drained pasta with the sauce and serve with grated cheese.',
      ],
      match: [
        ['pasta', 'macaroni', 'spaghetti', 'penne', 'fusilli', 'tagliatelle'],
        EN.tomato,
        EN.cheese,
        EN.garlic,
        EN.oil,
        EN.salt,
        EN.water,
      ],
    },
    'crema-calabacin': {
      title: 'Creamy zucchini soup',
      ingredients: ['Zucchini (2)', 'Onion', 'Potato', 'Cheese spread or cream', 'Olive oil', 'Salt', 'Water'],
      steps: [
        'Gently cook the onion in oil until soft. Add the chopped zucchini (and potato).',
        'Cover with water, add salt and simmer for about 20 minutes.',
        'Blend with the cheese spread or a splash of cream until smooth.',
      ],
      match: [EN.zucchini, EN.onion, EN.potato, ['cheese', 'cheese spread', 'cream'], EN.oil, EN.salt, EN.water],
    },
    'ensalada-garbanzos': {
      title: 'Chickpea salad',
      ingredients: ['Cooked chickpeas (400 g)', 'Tomato', 'Bell pepper', 'Onion', 'Tuna', 'Olive oil', 'Salt'],
      steps: [
        'Drain and rinse the chickpeas.',
        'Chop the tomato and the rest of the vegetables.',
        'Mix everything, dress with oil and salt, and add tuna if you like.',
      ],
      match: [
        ['chickpea', 'chickpeas', 'garbanzo', 'garbanzos'],
        EN.tomato,
        EN.pepper,
        EN.onion,
        ['tuna'],
        EN.oil,
        EN.salt,
      ],
    },
    'pollo-plancha-verduras': {
      title: 'Grilled chicken with vegetables',
      ingredients: ['Chicken breast (300 g)', 'Zucchini or eggplant', 'Bell pepper', 'Lemon', 'Olive oil', 'Salt'],
      steps: [
        'Slice the vegetables and grill them with a little oil.',
        'Grill the chicken until cooked through.',
        'Serve with a few drops of lemon.',
      ],
      match: [
        EN.chicken,
        [...EN.zucchini, 'eggplant', 'eggplants', 'aubergine', 'aubergines'],
        EN.pepper,
        EN.lemon,
        EN.oil,
        EN.salt,
      ],
    },
    'macarrones-carne': {
      title: 'Macaroni with ground beef',
      ingredients: ['Macaroni (400 g)', 'Ground beef (300 g)', 'Tomato sauce', 'Onion', 'Grated cheese', 'Olive oil', 'Salt', 'Water'],
      steps: [
        'Cook the macaroni in salted water.',
        'Sauté the onion, add the meat and cook until browned. Stir in the tomato sauce.',
        'Mix with the pasta and, if you like, top with cheese and grill.',
      ],
      match: [
        ['macaroni', 'pasta'],
        ['ground beef', 'ground meat', 'minced meat', 'mince'],
        EN.tomato,
        EN.onion,
        EN.cheese,
        EN.oil,
        EN.salt,
        EN.water,
      ],
    },
    'merluza-horno': {
      title: 'Baked fish with potatoes',
      ingredients: ['Hake or other white fish', 'Potatoes', 'Onion', 'Lemon', 'Olive oil', 'Salt'],
      steps: [
        'Preheat the oven to 200 °C (400 °F).',
        'Bake the sliced potatoes with onion, oil and salt for about 25 minutes.',
        'Place the fish on top and bake for 12-15 more minutes, until cooked.',
      ],
      match: [
        ['hake', 'cod', 'fish', 'haddock', 'pollock', 'sea bass', 'sea bream'],
        EN.potato,
        EN.onion,
        EN.lemon,
        EN.oil,
        EN.salt,
      ],
    },
    'revuelto-champinones': {
      title: 'Scrambled eggs with mushrooms',
      ingredients: ['Eggs (4)', 'Mushrooms', 'Garlic', 'Olive oil', 'Salt'],
      steps: [
        'Sauté the sliced mushrooms with garlic and oil.',
        'Add the eggs beaten with salt and stir over low heat until set.',
      ],
      match: [EN.egg, ['mushroom', 'mushrooms'], EN.garlic, EN.oil, EN.salt],
    },
    gazpacho: {
      title: 'Gazpacho',
      ingredients: [
        'Ripe tomatoes (1 kg)',
        'Cucumber',
        'Green pepper',
        'Garlic',
        'Day-old bread',
        'Vinegar',
        'Olive oil',
        'Salt',
        'Water',
      ],
      steps: [
        'Chop the vegetables and blend them with the bread, oil, vinegar and salt.',
        'Add cold water until you get the texture you like, and strain if you wish.',
        'Serve well chilled.',
      ],
      match: [EN.tomato, ['cucumber', 'cucumbers'], EN.pepper, EN.garlic, EN.bread, ['vinegar'], EN.oil, EN.salt, EN.water],
    },
    'yogur-fruta': {
      title: 'Yogurt with fruit and oats',
      ingredients: ['Plain yogurt', 'Fruit (banana, strawberries, apple…)', 'Rolled oats', 'Honey'],
      steps: ['Cut the fruit into pieces.', 'Serve it over the yogurt with oats and a little honey.'],
      match: [
        ['yogurt', 'yogurts', 'yoghurt', 'yoghurts'],
        [
          'banana',
          'bananas',
          'strawberry',
          'strawberries',
          'apple',
          'apples',
          'pear',
          'pears',
          'peach',
          'peaches',
          'kiwi',
          'kiwis',
        ],
        ['oat', 'oats', 'oatmeal'],
        ['honey'],
      ],
    },
    'tostadas-tomate': {
      title: 'Toast with tomato',
      ingredients: ['Bread', 'Tomato', 'Ham or cheese', 'Olive oil', 'Salt'],
      steps: ['Toast the bread.', 'Grate the tomato over it, add oil and salt and, if you like, ham or cheese.'],
      match: [EN.bread, EN.tomato, ['ham', ...EN.cheese], EN.oil, EN.salt],
    },
    'pure-patatas': {
      title: 'Mashed potatoes',
      ingredients: ['Potatoes (700 g)', 'Milk (150 ml)', 'Butter', 'Salt', 'Water'],
      steps: [
        'Boil the peeled, chopped potatoes in salted water until tender.',
        'Drain and mash them with the hot milk and the butter.',
      ],
      match: [EN.potato, ['milk'], ['butter'], EN.salt, EN.water],
    },
    'sopa-pollo': {
      title: 'Chicken and vegetable soup',
      ingredients: ['Chicken (thighs or carcass)', 'Carrot', 'Leek or onion', 'Soup noodles', 'Salt', 'Water'],
      steps: [
        'Simmer the chicken with the vegetables in salted water for about 45 minutes.',
        'Strain the broth, shred the chicken and add it back.',
        'Cook the noodles in the broth for the time shown on the package.',
      ],
      match: [EN.chicken, EN.carrot, ['leek', 'leeks', ...EN.onion], ['noodle', 'noodles', 'vermicelli'], EN.salt, EN.water],
    },
  },

  fr: {
    'tortilla-patatas': {
      title: 'Omelette espagnole aux pommes de terre (tortilla)',
      ingredients: ['Œufs (5)', 'Pommes de terre (600 g)', 'Oignon', "Huile d'olive", 'Sel'],
      steps: [
        "Épluchez les pommes de terre (et l'oignon, si vous en mettez) et coupez-les en fines lamelles.",
        "Faites-les frire à feu moyen dans beaucoup d'huile jusqu'à ce qu'elles soient tendres. Égouttez-les.",
        'Battez les œufs avec du sel et mélangez-les aux pommes de terre.',
        "Faites cuire le mélange dans une poêle avec un peu d'huile, retournez-le à l'aide d'une assiette et terminez la cuisson.",
      ],
      match: [FR.egg, FR.potato, FR.onion, FR.oil, FR.salt],
    },
    'arroz-verduras': {
      title: 'Riz sauté aux légumes',
      ingredients: ['Riz (250 g)', 'Poivron', 'Courgette', 'Carotte', 'Œuf', "Huile d'olive", 'Sel', 'Eau'],
      steps: [
        "Faites cuire le riz dans de l'eau salée et égouttez-le.",
        "Coupez les légumes en petits dés et faites-les sauter dans une poêle avec de l'huile.",
        'Ajoutez le riz et, si vous voulez, un œuf battu. Remuez à feu vif pendant deux minutes.',
      ],
      match: [FR.rice, FR.pepper, FR.zucchini, FR.carrot, FR.egg, FR.oil, FR.salt, FR.water],
    },
    lentejas: {
      title: 'Lentilles mijotées à l’espagnole',
      ingredients: ['Lentilles (300 g)', 'Carotte', 'Oignon', 'Pomme de terre', 'Paprika', "Huile d'olive", 'Sel', 'Eau'],
      steps: [
        "Faites revenir l'oignon et la carotte hachés dans l'huile.",
        "Ajoutez une cuillère à café de paprika, les lentilles et de l'eau pour les couvrir largement.",
        'Laissez mijoter 35 à 40 minutes (ajoutez la pomme de terre en morceaux à mi-cuisson). Salez à la fin.',
      ],
      match: [['lentille', 'lentilles'], FR.carrot, FR.onion, FR.potato, ['paprika'], FR.oil, FR.salt, FR.water],
    },
    'pasta-tomate': {
      title: 'Pâtes à la tomate',
      ingredients: ['Pâtes (200 g)', 'Tomates concassées ou sauce tomate', 'Fromage râpé', 'Ail', "Huile d'olive", 'Sel', 'Eau'],
      steps: [
        "Faites cuire les pâtes dans de l'eau salée le temps indiqué sur l'emballage.",
        "Pendant ce temps, chauffez la tomate dans une poêle avec un peu d'huile (et de l'ail haché, si vous voulez).",
        'Mélangez les pâtes égouttées avec la sauce et servez avec du fromage râpé.',
      ],
      match: [
        ['pates', 'macaroni', 'macaronis', 'spaghetti', 'spaghettis', 'penne', 'tagliatelle', 'tagliatelles', 'coquillettes'],
        FR.tomato,
        FR.cheese,
        FR.garlic,
        FR.oil,
        FR.salt,
        FR.water,
      ],
    },
    'crema-calabacin': {
      title: 'Velouté de courgettes',
      ingredients: ['Courgettes (2)', 'Oignon', 'Pomme de terre', 'Fromage fondu ou crème', "Huile d'olive", 'Sel', 'Eau'],
      steps: [
        "Faites fondre l'oignon dans l'huile. Ajoutez les courgettes (et la pomme de terre) en morceaux.",
        "Couvrez d'eau, salez et laissez cuire environ 20 minutes.",
        "Mixez avec le fromage fondu ou un trait de crème jusqu'à obtenir une texture lisse.",
      ],
      match: [FR.zucchini, FR.onion, FR.potato, ['fromage', 'fromage fondu', 'creme'], FR.oil, FR.salt, FR.water],
    },
    'ensalada-garbanzos': {
      title: 'Salade de pois chiches',
      ingredients: ['Pois chiches cuits (400 g)', 'Tomate', 'Poivron', 'Oignon', 'Thon', "Huile d'olive", 'Sel'],
      steps: [
        'Égouttez et rincez les pois chiches.',
        'Coupez la tomate et le reste des légumes.',
        "Mélangez le tout, assaisonnez d'huile et de sel, et ajoutez du thon si vous voulez.",
      ],
      match: [['pois chiche', 'pois chiches'], FR.tomato, FR.pepper, FR.onion, ['thon'], FR.oil, FR.salt],
    },
    'pollo-plancha-verduras': {
      title: 'Poulet grillé aux légumes',
      ingredients: ['Blanc de poulet (300 g)', 'Courgette ou aubergine', 'Poivron', 'Citron', "Huile d'olive", 'Sel'],
      steps: [
        "Coupez les légumes en rondelles et faites-les griller avec un peu d'huile.",
        "Faites griller le poulet jusqu'à ce qu'il soit bien cuit à cœur.",
        'Servez avec quelques gouttes de citron.',
      ],
      match: [FR.chicken, [...FR.zucchini, 'aubergine', 'aubergines'], FR.pepper, FR.lemon, FR.oil, FR.salt],
    },
    'macarrones-carne': {
      title: 'Macaronis à la viande hachée',
      ingredients: ['Macaronis (400 g)', 'Viande hachée (300 g)', 'Sauce tomate', 'Oignon', 'Fromage râpé', "Huile d'olive", 'Sel', 'Eau'],
      steps: [
        "Faites cuire les macaronis dans de l'eau salée.",
        "Faites revenir l'oignon, ajoutez la viande et laissez-la dorer. Ajoutez la sauce tomate.",
        'Mélangez avec les pâtes et, si vous voulez, faites gratiner avec du fromage.',
      ],
      match: [
        ['macaroni', 'macaronis', 'pates'],
        ['viande hachee', 'steak hache', 'steaks haches', 'hachee', 'hache'],
        FR.tomato,
        FR.onion,
        FR.cheese,
        FR.oil,
        FR.salt,
        FR.water,
      ],
    },
    'merluza-horno': {
      title: 'Poisson au four et pommes de terre',
      ingredients: ['Merlu ou autre poisson blanc', 'Pommes de terre', 'Oignon', 'Citron', "Huile d'olive", 'Sel'],
      steps: [
        'Préchauffez le four à 200 °C.',
        "Enfournez les pommes de terre en rondelles avec l'oignon, l'huile et le sel pendant environ 25 minutes.",
        "Posez le poisson par-dessus et prolongez la cuisson de 12 à 15 minutes, jusqu'à ce qu'il soit cuit.",
      ],
      match: [
        ['merlu', 'colin', 'cabillaud', 'poisson', 'lieu', 'bar', 'dorade', 'daurade'],
        FR.potato,
        FR.onion,
        FR.lemon,
        FR.oil,
        FR.salt,
      ],
    },
    'revuelto-champinones': {
      title: 'Œufs brouillés aux champignons',
      ingredients: ['Œufs (4)', 'Champignons', 'Ail', "Huile d'olive", 'Sel'],
      steps: [
        "Faites sauter les champignons émincés avec l'ail et l'huile.",
        "Ajoutez les œufs battus avec du sel et remuez à feu doux jusqu'à ce qu'ils prennent.",
      ],
      match: [FR.egg, ['champignon', 'champignons'], FR.garlic, FR.oil, FR.salt],
    },
    gazpacho: {
      title: 'Gaspacho',
      ingredients: [
        'Tomates mûres (1 kg)',
        'Concombre',
        'Poivron vert',
        'Ail',
        'Pain de la veille',
        'Vinaigre',
        "Huile d'olive",
        'Sel',
        'Eau',
      ],
      steps: [
        "Coupez les légumes en morceaux et mixez-les avec le pain, l'huile, le vinaigre et le sel.",
        "Ajoutez de l'eau froide jusqu'à la consistance souhaitée et filtrez si vous le voulez.",
        'Servez bien frais.',
      ],
      match: [FR.tomato, ['concombre', 'concombres'], FR.pepper, FR.garlic, FR.bread, ['vinaigre'], FR.oil, FR.salt, FR.water],
    },
    'yogur-fruta': {
      title: "Yaourt aux fruits et flocons d'avoine",
      ingredients: ['Yaourt nature', 'Fruits (banane, fraises, pomme…)', "Flocons d'avoine", 'Miel'],
      steps: ['Coupez les fruits en morceaux.', "Servez-les sur le yaourt avec l'avoine et un peu de miel."],
      match: [
        ['yaourt', 'yaourts', 'yogourt', 'yogourts'],
        // «pomme» se omite a propósito: coincidiría con «pommes de terre».
        ['banane', 'bananes', 'fraise', 'fraises', 'poire', 'poires', 'peche', 'peches', 'kiwi', 'kiwis'],
        ['avoine'],
        ['miel'],
      ],
    },
    'tostadas-tomate': {
      title: 'Tartines à la tomate',
      ingredients: ['Pain', 'Tomate', 'Jambon ou fromage', "Huile d'olive", 'Sel'],
      steps: [
        'Faites griller le pain.',
        "Râpez la tomate dessus, ajoutez l'huile et le sel et, si vous voulez, du jambon ou du fromage.",
      ],
      match: [FR.bread, FR.tomato, ['jambon', ...FR.cheese], FR.oil, FR.salt],
    },
    'pure-patatas': {
      title: 'Purée de pommes de terre',
      ingredients: ['Pommes de terre (700 g)', 'Lait (150 ml)', 'Beurre', 'Sel', 'Eau'],
      steps: [
        "Faites cuire les pommes de terre épluchées et coupées dans de l'eau salée jusqu'à ce qu'elles soient tendres.",
        'Égouttez-les et écrasez-les avec le lait chaud et le beurre.',
      ],
      match: [FR.potato, ['lait'], ['beurre'], FR.salt, FR.water],
    },
    'sopa-pollo': {
      title: 'Soupe de poulet aux légumes',
      ingredients: ['Poulet (cuisses ou carcasse)', 'Carotte', 'Poireau ou oignon', 'Vermicelles', 'Sel', 'Eau'],
      steps: [
        "Faites cuire le poulet avec les légumes dans de l'eau salée pendant environ 45 minutes.",
        'Filtrez le bouillon, effilochez le poulet et remettez-le dans la soupe.',
        "Faites cuire les vermicelles dans le bouillon le temps indiqué sur l'emballage.",
      ],
      match: [FR.chicken, FR.carrot, ['poireau', 'poireaux', ...FR.onion], ['vermicelle', 'vermicelles'], FR.salt, FR.water],
    },
  },

  pt: {
    'tortilla-patatas': {
      title: 'Tortilha espanhola de batata',
      ingredients: ['Ovos (5)', 'Batatas (600 g)', 'Cebola', 'Azeite de oliva', 'Sal'],
      steps: [
        'Descasque as batatas (e a cebola, se for usar) e corte-as em fatias finas.',
        'Frite-as em fogo médio com bastante azeite até ficarem macias. Escorra.',
        'Bata os ovos com sal e misture com as batatas.',
        'Doure a mistura numa frigideira com um pouco de azeite, vire com a ajuda de um prato e termine de cozinhar.',
      ],
      match: [PT.egg, PT.potato, PT.onion, PT.oil, PT.salt],
    },
    'arroz-verduras': {
      title: 'Arroz salteado com legumes',
      ingredients: ['Arroz (250 g)', 'Pimentão', 'Abobrinha', 'Cenoura', 'Ovo', 'Azeite de oliva', 'Sal', 'Água'],
      steps: [
        'Cozinhe o arroz em água com sal e escorra.',
        'Corte os legumes em cubinhos e refogue-os numa frigideira com azeite.',
        'Junte o arroz e, se quiser, um ovo batido. Mexa em fogo alto por um ou dois minutos.',
      ],
      match: [PT.rice, PT.pepper, PT.zucchini, PT.carrot, PT.egg, PT.oil, PT.salt, PT.water],
    },
    lentejas: {
      title: 'Lentilha ensopada',
      ingredients: ['Lentilha (300 g)', 'Cenoura', 'Cebola', 'Batata', 'Páprica', 'Azeite de oliva', 'Sal', 'Água'],
      steps: [
        'Refogue a cebola e a cenoura picadas no azeite.',
        'Junte uma colher de chá de páprica, a lentilha e água suficiente para cobrir bem.',
        'Cozinhe em fogo baixo por 35-40 minutos (acrescente a batata em pedaços na metade do cozimento). Tempere com sal no final.',
      ],
      match: [['lentilha', 'lentilhas'], PT.carrot, PT.onion, PT.potato, ['paprica', 'colorau'], PT.oil, PT.salt, PT.water],
    },
    'pasta-tomate': {
      title: 'Macarrão ao molho de tomate',
      ingredients: ['Macarrão (200 g)', 'Tomate pelado ou molho de tomate', 'Queijo ralado', 'Alho', 'Azeite de oliva', 'Sal', 'Água'],
      steps: [
        'Cozinhe o macarrão em água com sal pelo tempo indicado na embalagem.',
        'Enquanto isso, aqueça o tomate numa frigideira com um pouco de azeite (e alho picado, se quiser).',
        'Misture o macarrão escorrido com o molho e sirva com queijo ralado.',
      ],
      match: [
        ['macarrao', 'espaguete', 'talharim', 'penne', 'parafuso'],
        PT.tomato,
        PT.cheese,
        PT.garlic,
        PT.oil,
        PT.salt,
        PT.water,
      ],
    },
    'crema-calabacin': {
      title: 'Creme de abobrinha',
      ingredients: ['Abobrinha (2)', 'Cebola', 'Batata', 'Requeijão ou creme de leite', 'Azeite de oliva', 'Sal', 'Água'],
      steps: [
        'Refogue a cebola no azeite até murchar. Junte a abobrinha (e a batata) em pedaços.',
        'Cubra com água, tempere com sal e cozinhe por uns 20 minutos.',
        'Bata com o requeijão ou um pouco de creme de leite até ficar homogêneo.',
      ],
      match: [PT.zucchini, PT.onion, PT.potato, ['requeijao', 'creme de leite', 'queijo', 'nata'], PT.oil, PT.salt, PT.water],
    },
    'ensalada-garbanzos': {
      title: 'Salada de grão-de-bico',
      ingredients: ['Grão-de-bico cozido (400 g)', 'Tomate', 'Pimentão', 'Cebola', 'Atum', 'Azeite de oliva', 'Sal'],
      steps: [
        'Escorra e lave o grão-de-bico.',
        'Pique o tomate e o restante dos legumes.',
        'Misture tudo, tempere com azeite e sal e, se quiser, junte atum.',
      ],
      match: [['grao de bico'], PT.tomato, PT.pepper, PT.onion, ['atum'], PT.oil, PT.salt],
    },
    'pollo-plancha-verduras': {
      title: 'Frango grelhado com legumes',
      ingredients: ['Peito de frango (300 g)', 'Abobrinha ou berinjela', 'Pimentão', 'Limão', 'Azeite de oliva', 'Sal'],
      steps: [
        'Corte os legumes em rodelas e grelhe-os com um pouco de azeite.',
        'Grelhe o frango até ficar bem cozido por dentro.',
        'Sirva com algumas gotas de limão.',
      ],
      match: [PT.chicken, [...PT.zucchini, 'berinjela', 'berinjelas'], PT.pepper, PT.lemon, PT.oil, PT.salt],
    },
    'macarrones-carne': {
      title: 'Macarrão com carne moída',
      ingredients: ['Macarrão (400 g)', 'Carne moída (300 g)', 'Molho de tomate', 'Cebola', 'Queijo ralado', 'Azeite de oliva', 'Sal', 'Água'],
      steps: [
        'Cozinhe o macarrão em água com sal.',
        'Refogue a cebola, junte a carne e cozinhe até dourar. Acrescente o molho de tomate.',
        'Misture com o macarrão e, se quiser, gratine com queijo.',
      ],
      match: [
        ['macarrao', 'penne', 'parafuso'],
        ['carne moida', 'moida'],
        PT.tomato,
        PT.onion,
        PT.cheese,
        PT.oil,
        PT.salt,
        PT.water,
      ],
    },
    'merluza-horno': {
      title: 'Peixe assado com batatas',
      ingredients: ['Merluza ou outro peixe branco', 'Batatas', 'Cebola', 'Limão', 'Azeite de oliva', 'Sal'],
      steps: [
        'Preaqueça o forno a 200 °C.',
        'Asse as batatas em rodelas com cebola, azeite e sal por uns 25 minutos.',
        'Coloque o peixe por cima e asse por mais 12-15 minutos, até ficar cozido.',
      ],
      match: [
        ['merluza', 'pescada', 'bacalhau', 'peixe', 'tilapia', 'robalo', 'dourado', 'dourada'],
        PT.potato,
        PT.onion,
        PT.lemon,
        PT.oil,
        PT.salt,
      ],
    },
    'revuelto-champinones': {
      title: 'Ovos mexidos com cogumelos',
      ingredients: ['Ovos (4)', 'Cogumelos', 'Alho', 'Azeite de oliva', 'Sal'],
      steps: [
        'Refogue os cogumelos fatiados com alho e azeite.',
        'Junte os ovos batidos com sal e mexa em fogo baixo até firmarem.',
      ],
      match: [PT.egg, ['cogumelo', 'cogumelos', 'champignon', 'champignons', 'shimeji'], PT.garlic, PT.oil, PT.salt],
    },
    gazpacho: {
      title: 'Gaspacho',
      ingredients: [
        'Tomates maduros (1 kg)',
        'Pepino',
        'Pimentão verde',
        'Alho',
        'Pão amanhecido',
        'Vinagre',
        'Azeite de oliva',
        'Sal',
        'Água',
      ],
      steps: [
        'Corte os legumes em pedaços e bata no liquidificador com o pão, o azeite, o vinagre e o sal.',
        'Acrescente água gelada até a consistência que preferir e coe, se quiser.',
        'Sirva bem gelado.',
      ],
      match: [PT.tomato, ['pepino', 'pepinos'], PT.pepper, PT.garlic, PT.bread, ['vinagre'], PT.oil, PT.salt, PT.water],
    },
    'yogur-fruta': {
      title: 'Iogurte com frutas e aveia',
      ingredients: ['Iogurte natural', 'Frutas (banana, morango, maçã…)', 'Aveia em flocos', 'Mel'],
      steps: ['Corte as frutas em pedaços.', 'Sirva sobre o iogurte com aveia e um pouco de mel.'],
      match: [
        ['iogurte', 'iogurtes'],
        ['banana', 'bananas', 'morango', 'morangos', 'maca', 'macas', 'pera', 'peras', 'pessego', 'pessegos', 'kiwi', 'kiwis'],
        ['aveia'],
        ['mel'],
      ],
    },
    'tostadas-tomate': {
      title: 'Torradas com tomate',
      ingredients: ['Pão', 'Tomate', 'Presunto ou queijo', 'Azeite de oliva', 'Sal'],
      steps: ['Toste o pão.', 'Rale o tomate por cima, junte azeite e sal e, se quiser, presunto ou queijo.'],
      match: [PT.bread, PT.tomato, ['presunto', ...PT.cheese], PT.oil, PT.salt],
    },
    'pure-patatas': {
      title: 'Purê de batata',
      ingredients: ['Batatas (700 g)', 'Leite (150 ml)', 'Manteiga', 'Sal', 'Água'],
      steps: [
        'Cozinhe as batatas descascadas e em pedaços em água com sal até ficarem macias.',
        'Escorra e amasse-as com o leite quente e a manteiga.',
      ],
      match: [PT.potato, ['leite'], ['manteiga'], PT.salt, PT.water],
    },
    'sopa-pollo': {
      title: 'Sopa de frango com legumes',
      ingredients: ['Frango (coxas ou carcaça)', 'Cenoura', 'Alho-poró ou cebola', 'Macarrão para sopa', 'Sal', 'Água'],
      steps: [
        'Cozinhe o frango com os legumes em água com sal por uns 45 minutos.',
        'Coe o caldo, desfie o frango e devolva-o à panela.',
        'Cozinhe o macarrão no caldo pelo tempo indicado na embalagem.',
      ],
      match: [
        PT.chicken,
        PT.carrot,
        ['alho poro', ...PT.onion],
        ['aletria', 'cabelo de anjo', 'letrinha', 'macarrao'],
        PT.salt,
        PT.water,
      ],
    },
  },
};
