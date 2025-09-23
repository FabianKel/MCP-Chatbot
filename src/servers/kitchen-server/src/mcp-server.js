const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} = require('@modelcontextprotocol/sdk/types.js');
const fs = require('fs');
const path = require('path');
const { levenshtein, getUtensilsForRecipe } = require('./utils');


const dataDir = path.join(__dirname, 'data');
const ingredientesPath = path.join(dataDir, 'ingredientes_unificados.json');
const recetasPath = path.join(dataDir, 'recetas_unificadas.json');
const substitutionsPath = path.join(dataDir, 'ingredient_substitutions.json');
const allDietsPath = path.join(dataDir, 'All_Diets.json');

let allDiets = [];
let foods = [];
let recetas = [];
let substitutions = {};

// Cargar los datos JSON
function loadFoods() {
  if (fs.existsSync(allDietsPath)) {
    try {
      allDiets = JSON.parse(fs.readFileSync(allDietsPath, 'utf-8'));
    } catch (e) {
      console.error('Error loading All_Diets.json:', e);
    }
  }
  if (fs.existsSync(ingredientesPath)) {
    try {
      foods = JSON.parse(fs.readFileSync(ingredientesPath, 'utf-8'));
    } catch (e) {
      console.error('Error loading ingredientes_unificados.json:', e);
    }
  }
  if (fs.existsSync(recetasPath)) {
    try {
      recetas = JSON.parse(fs.readFileSync(recetasPath, 'utf-8'));
    } catch (e) {
      console.error('Error loading recetas_unificadas.json:', e);
    }
  }
  if (fs.existsSync(substitutionsPath)) {
    try {
      substitutions = JSON.parse(fs.readFileSync(substitutionsPath, 'utf-8'));
    } catch (e) {
      console.error('Error loading ingredient_substitutions.json:', e);
    }
  }
}

// Crear servidor MCP
const server = new Server(
  {
    name: 'kitchen-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Definir herramientas MCP
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'recommend_by_mood_and_season',
        description: 'Recommends foods or recipes based on mood and optionally season (e.g., happy + summer).',
        inputSchema: {
          type: 'object',
          properties: {
            mood: {
              type: 'string',
              description: 'Main mood (happy, excited, tender, scared, angry, sad)'
            },
            season: {
              type: 'string',
              description: 'Season (spring, summer, autumn, winter) (optional)'
            },
            type: {
              type: 'string',
              description: 'Type: "food" or "recipe" (optional, default: recipe)'
            }
          },
          required: ['mood']
        }
      },
      {
        name: 'suggest_utensils_for_recipe',
        description: 'Suggests necessary kitchen utensils for a given recipe (by name).',
        inputSchema: {
          type: 'object',
          properties: {
            recipe_name: {
              type: 'string',
              description: 'Name of the recipe or dish',
            },
          },
          required: ['recipe_name'],
        },
      },
      {
        name: 'get_foods',
        description: 'Get all available foods',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'suggest_recipe_by_diet',
        description: 'Suggests recipes by diet type (e.g., vegan, keto, Mediterranean, paleo, DASH).',
        inputSchema: {
          type: 'object',
          properties: {
            diet: {
              type: 'string',
              description: 'Diet type: vegan, keto, Mediterranean, paleo, DASH',
            },
            maxCalories: {
              type: 'number',
              description: 'Maximum calories (optional)',
            },
          },
          required: ['diet'],
        },
      },
      {
        name: 'suggest_ingredient_substitution',
        description: 'Suggests substitutes for a given ingredient (e.g., orange juice).',
        inputSchema: {
          type: 'object',
          properties: {
            ingredient: {
              type: 'string',
              description: 'Name of the ingredient to substitute',
            },
          },
          required: ['ingredient'],
        },
      },
      {
        name: 'get_food_by_name',
        description: 'Find a specific food by name',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the food to search for',
            },
          },
          required: ['name'],
        },
      },
      {
        name: 'search_foods',
        description: 'Search foods by nutritional criteria',
        inputSchema: {
          type: 'object',
          properties: {
            minProtein: {
              type: 'number',
              description: 'Minimum protein in grams',
            },
            maxFat: {
              type: 'number',
              description: 'Maximum fat in grams',
            },
            maxCalories: {
              type: 'number',
              description: 'Maximum calories',
            },
          },
        },
      },
      {
        name: 'get_ingredients',
        description: 'Get list of available ingredients',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_recipe_suggestions',
        description: 'Get recipe suggestions based on nutritional content',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_recipes',
        description: 'Get all available recipes',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_recipes_by_ingredients',
        description: 'Find recipes by specific ingredients',
        inputSchema: {
          type: 'object',
          properties: {
            ingredients: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'List of ingredients to search for',
            },
          },
          required: ['ingredients'],
        },
      },
    ],
  };
});

// Implementar manejadores de herramientas
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  // Permitir ambos formatos: directo y tools/call
  let toolName, toolArgs;
  if (request.params && request.params.name && request.params.arguments) {
    // Formato genérico: { method: "tools/call", params: { name, arguments } }
    toolName = request.params.name;
    toolArgs = request.params.arguments;
  } else {
    // Formato directo: { method: "tool_name", params: { ... } }
    toolName = request.method;
    toolArgs = request.params;
  }

  try {
    switch (toolName) {
      case 'recommend_by_mood_and_season': {
        const { mood, season, type } = toolArgs;
        if (!mood) {
          throw new McpError(ErrorCode.InvalidParams, 'Parameter "mood" is required');
        }
        // Elegir fuente: recetas o foods
        let items = [];
        if (type === 'food') {
          items = foods;
        } else {
          items = recetas.length > 0 ? recetas : foods;
        }
        const { getFoodOrRecipeByMoodAndSeason } = require('./utils');
        const result = getFoodOrRecipeByMoodAndSeason(items, mood, season);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }
      case 'suggest_utensils_for_recipe': {
        if (!toolArgs.recipe_name || typeof toolArgs.recipe_name !== 'string') {
          throw new McpError(ErrorCode.InvalidParams, 'Parámetro "recipe_name" requerido (string)');
        }
        const utensils = getUtensilsForRecipe(toolArgs.recipe_name);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                recipe: args.recipe_name,
                utensils
              }, null, 2),
            },
          ],
        };
      }
      case 'suggest_recipe_by_diet': {
        // diet: vegan, keto, mediterranean, paleo, dash
        if (!toolArgs.diet || typeof toolArgs.diet !== 'string') {
          throw new McpError(ErrorCode.InvalidParams, 'Parámetro "diet" requerido (string)');
        }
        const dietMap = {
          vegan: 'vegan',
          keto: 'keto',
          mediterranean: 'mediterranean',
          paleo: 'paleo',
          dash: 'dash',
        };
        // Permitir variantes en minúsculas y acentos
        const inputDiet = toolArgs.diet.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        let mappedDiet = null;
        for (const key in dietMap) {
          if (inputDiet.includes(key)) {
            mappedDiet = dietMap[key];
            break;
          }
        }
        if (!mappedDiet) {
          return {
            content: [{ type: 'text', text: 'No se reconoce el tipo de dieta solicitado.' }],
          };
        }
        let filtered = allDiets.filter(r => r.Diet_type && r.Diet_type.toLowerCase() === mappedDiet);
        if (toolArgs.maxCalories) {
          filtered = filtered.filter(r => parseFloat(r['Carbs(g)'] || 0) + parseFloat(r['Fat(g)'] || 0) + parseFloat(r['Protein(g)'] || 0) <= toolArgs.maxCalories);
        }
        // Si no hay resultados, devolver mensaje
        if (!filtered.length) {
          return {
            content: [{ type: 'text', text: 'No se encontraron recetas para esa dieta.' }],
          };
        }
        // Devolver hasta 5 recetas
        const result = filtered.slice(0, 5);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }
      case 'get_foods':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(foods, null, 2),
            },
          ],
        };

      case 'get_food_by_name':
        const food = foods.find(f => 
          f.food && f.food.toLowerCase() === toolArgs.name.toLowerCase()
        ) || null;
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(food, null, 2),
            },
          ],
        };

      case 'search_foods':
        const filtered = foods.filter(f => {
          let ok = true;
          if (args.minProtein) ok = ok && parseFloat(f.protein_g) >= parseFloat(args.minProtein);
          if (args.maxFat) ok = ok && parseFloat(f.fat) <= parseFloat(args.maxFat);
          if (args.maxCalories) ok = ok && parseFloat(f.energy_kcal) <= parseFloat(args.maxCalories);
          return ok;
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(filtered, null, 2),
            },
          ],
        };

      case 'get_ingredients':
        const ingredients = Array.from(new Set(foods.map(f => f.food))).filter(Boolean);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(ingredients, null, 2),
            },
          ],
        };

      case 'get_recipe_suggestions':
        const source = recetas.length > 0 ? recetas : foods;
        const suggestions = source
          .filter(r => r.protein_g && r.fat)
          .sort((a, b) => parseFloat(b.protein_g) - parseFloat(a.protein_g) ||
                          parseFloat(a.fat) - parseFloat(b.fat))
          .slice(0, 5);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(suggestions, null, 2),
            },
          ],
        };

      case 'get_recipes':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(recetas, null, 2),
            },
          ],
        };

      case 'get_recipes_by_ingredients':
        if (!toolArgs.ingredients || !Array.isArray(toolArgs.ingredients)) {
          throw new McpError(ErrorCode.InvalidParams, 'Parámetro "ingredients" requerido (array de strings)');
        }

        const searchIngredients = toolArgs.ingredients.map(i =>
          i.trim().toLowerCase().normalize('NFD').replace(/[^\w\s]/gi, '')
        );

        let recetasCoincidentes = recetas
          .map(r => {
            let recetaIngs = Array.isArray(r.ingredients)
              ? r.ingredients
              : typeof r.ingredients === 'string'
                ? r.ingredients.split(',')
                : [];

            recetaIngs = recetaIngs.map(i =>
              i.trim().toLowerCase().normalize('NFD').replace(/[^\w\s]/gi, '')
            );

            const coincidencias = searchIngredients.filter(ing => {
              return recetaIngs.some(ring => {
                if (ring.includes(ing)) return true;
                return levenshtein(ring, ing) <= 3;
              });
            });

            return { receta: r, coincidencias: coincidencias.length };
          })
          .filter(x => x.coincidencias > 0);

        recetasCoincidentes.sort((a, b) => b.coincidencias - a.coincidencias);
        const result = recetasCoincidentes.slice(0, 5).map(x => x.receta);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };

      case 'suggest_ingredient_substitution': {
        // Buscar sustitutos para el ingrediente dado
        if (!toolArgs.ingredient || typeof toolArgs.ingredient !== 'string') {
          throw new McpError(ErrorCode.InvalidParams, 'Parámetro "ingredient" requerido (string)');
        }
        // Normalizar el nombre para buscar coincidencias cercanas
        const input = toolArgs.ingredient.trim().toLowerCase();
        let foundKey = null;
        // 1. Coincidencia exacta
        for (const key of Object.keys(substitutions)) {
          if (key.toLowerCase() === input) {
            foundKey = key;
            break;
          }
        }
        // 2. Coincidencia parcial (input incluido en la clave o viceversa)
        if (!foundKey) {
          for (const key of Object.keys(substitutions)) {
            const keyNorm = key.toLowerCase();
            if (keyNorm.includes(input) || input.includes(keyNorm)) {
              foundKey = key;
              break;
            }
          }
        }
        // 3. Coincidencia por similitud (levenshtein)
        if (!foundKey) {
          let minDist = 4;
          for (const key of Object.keys(substitutions)) {
            const dist = levenshtein(key.toLowerCase(), input);
            if (dist < minDist) {
              minDist = dist;
              foundKey = key;
            }
          }
        }
        if (foundKey) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  ingredient: foundKey,
                  substitutions: substitutions[foundKey],
                }, null, 2),
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: 'No se encontraron sustitutos para el ingrediente solicitado.'
              },
            ],
          };
        }
      }
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Herramienta desconocida: ${toolName}`);
    }
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(ErrorCode.InternalError, `Error ejecutando ${name}: ${error.message}`);
  }
});

// Inicializar y ejecutar servidor
async function runServer() {
  loadFoods();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Kitchen MCP Server ejecutándose...');
}

runServer().catch(console.error);