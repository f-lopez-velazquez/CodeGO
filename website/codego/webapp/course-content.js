/* Ejemplos y actividades originales de CodeGO; referencias al currículo de freeCodeCamp. */
(function(root){ const content = {
  "version": 2,
  "modules": [
    "Primeros pasos",
    "Decisiones y repetición",
    "Colecciones",
    "Funciones y calidad",
    "Datos y proyectos"
  ],
  "lessons": [
    {
      "id": "first-program",
      "title": "Tu primer programa",
      "module": 0,
      "minutes": 20,
      "source": "https://github.com/freeCodeCamp/freeCodeCamp/tree/main/curriculum/challenges/english/blocks/lecture-introduction-to-python",
      "explanation": [
        "Python ejecuta las instrucciones de arriba hacia abajo. print() muestra un resultado; el texto se escribe entre comillas. Un comentario empieza con # y explica una intención sin ejecutarse.",
        "En CodeGO el archivo se guarda antes de ejecutar. La consola muestra lo que ocurrió; que el código no dé error no demuestra todavía que resuelva el problema. Prueba el resultado esperado y también un caso distinto."
      ],
      "keyPoints": [
        "Ejecuta un cambio pequeño cada vez.",
        "print() muestra; una variable conserva un valor.",
        "Los comentarios no sustituyen al código."
      ],
      "examples": [
        {
          "title": "Dos instrucciones",
          "code": "print(\"Hola\")\nprint(2 + 3)",
          "output": "Hola\n5",
          "explanation": "La primera línea muestra texto y la segunda calcula la suma antes de mostrarla."
        },
        {
          "title": "El texto no se calcula",
          "code": "print(\"2 + 3\")\nprint(2 + 3)",
          "output": "2 + 3\n5",
          "explanation": "Las comillas distinguen una cadena de una expresión numérica."
        }
      ],
      "quiz": [
        {
          "prompt": "¿Qué muestra print(\"3 * 2\")?",
          "choices": [
            "6",
            "3 * 2",
            "Un error",
            "32"
          ],
          "answer": 1,
          "explanation": "Dentro de comillas hay texto: Python no calcula la multiplicación."
        },
        {
          "prompt": "¿Qué se ejecuta primero?",
          "choices": [
            "La última línea",
            "Todas a la vez",
            "La primera instrucción del archivo",
            "Los comentarios"
          ],
          "answer": 2,
          "explanation": "Python sigue el orden del archivo, salvo que una estructura cambie ese flujo."
        },
        {
          "prompt": "¿Qué inicia un comentario?",
          "choices": [
            "//",
            "#",
            "<!--",
            "**"
          ],
          "answer": 1,
          "explanation": "# comenta hasta el final de la línea, salvo que esté dentro de una cadena."
        }
      ],
      "exercises": [
        {
          "id": "first-card",
          "title": "Tu tarjeta",
          "prompt": "Crea nombre con el texto \"Ana\" y edad con el entero 18. Muestra ambos con print().",
          "starter": "nombre = \"\"\nedad = 0\n# Completa los datos y muéstralos\n",
          "tests": [
            {
              "check": "assert nombre == \"Ana\"",
              "feedback": "nombre debe contener el texto Ana."
            },
            {
              "check": "assert edad == 18 and type(edad) is int",
              "feedback": "edad debe ser el número entero 18, sin comillas."
            }
          ],
          "hints": [
            "Escribe el nombre entre comillas.",
            "Usa print(nombre, edad) para observar tus datos."
          ]
        },
        {
          "id": "first-calculation",
          "title": "Una cuenta verificable",
          "prompt": "Guarda el resultado de (8 + 4) * 2 en resultado y muéstralo.",
          "starter": "resultado = 0\n",
          "tests": [
            {
              "check": "assert resultado == 24",
              "feedback": "Los paréntesis hacen que 8 + 4 se calcule primero."
            },
            {
              "check": "assert isinstance(resultado, (int, float))",
              "feedback": "Conserva un número para poder usarlo en otros cálculos."
            }
          ],
          "hints": [
            "Primero resuelve la suma.",
            "No encierres la operación completa entre comillas."
          ]
        }
      ],
      "pitfall": "Si no ves nada, comprueba que usaste print() y que ejecutaste el archivo correcto."
    },
    {
      "id": "variables",
      "title": "Variables y tipos",
      "module": 0,
      "minutes": 20,
      "source": "https://github.com/freeCodeCamp/freeCodeCamp/tree/main/curriculum/challenges/english/blocks/core-primitives-in-python",
      "explanation": [
        "Una variable relaciona un nombre con un valor. Puedes reasignarla; una asignación posterior no actualiza otras variables que ya recibieron un número anterior.",
        "Los tipos básicos incluyen int, float, str y bool. type() permite inspeccionarlos. Usa nombres que expliquen qué representa el dato, como total o nombre_alumno."
      ],
      "keyPoints": [
        "= asigna un valor; no compara.",
        "Los nombres distinguen mayúsculas.",
        "Una cadena y un número representan cosas distintas."
      ],
      "examples": [
        {
          "title": "Reasignación",
          "code": "a = 5\nb = a\na = 9\nprint(a, b)",
          "output": "9 5",
          "explanation": "b conserva el entero recibido antes de cambiar a."
        },
        {
          "title": "Tipos visibles",
          "code": "print(type(7).__name__)\nprint(type(\"7\").__name__)",
          "output": "int\nstr",
          "explanation": "El mismo símbolo escrito con comillas es texto."
        }
      ],
      "quiz": [
        {
          "prompt": "x = 4; y = x; x = 8. ¿Cuánto vale y?",
          "choices": [
            "8",
            "4",
            "12",
            "No existe"
          ],
          "answer": 1,
          "explanation": "y recibió el número 4. Reasignar x no cambia ese entero."
        },
        {
          "prompt": "¿Cuál es un nombre válido?",
          "choices": [
            "2total",
            "nombre alumno",
            "nombre_alumno",
            "class"
          ],
          "answer": 2,
          "explanation": "Puede usar letras, números y guion bajo, sin empezar por número ni usar palabras reservadas."
        },
        {
          "prompt": "¿Qué tipo tiene True?",
          "choices": [
            "str",
            "int",
            "bool",
            "float"
          ],
          "answer": 2,
          "explanation": "True y False representan valores booleanos."
        }
      ],
      "exercises": [
        {
          "id": "typed-profile",
          "title": "Una ficha con tipos",
          "prompt": "Define ciudad = \"Salamanca\", habitantes = 120 y activo = True.",
          "starter": "ciudad = \"\"\nhabitantes = 0\nactivo = False\n",
          "tests": [
            {
              "check": "assert ciudad == \"Salamanca\"",
              "feedback": "ciudad debe ser texto."
            },
            {
              "check": "assert habitantes == 120 and type(habitantes) is int",
              "feedback": "habitantes debe ser un entero."
            },
            {
              "check": "assert activo is True",
              "feedback": "activo debe ser True, no el texto \"True\"."
            }
          ],
          "hints": [
            "Las cadenas llevan comillas.",
            "Los booleanos empiezan con mayúscula."
          ]
        },
        {
          "id": "swap-values",
          "title": "Intercambia valores",
          "prompt": "Empieza con a = 3 y b = 7. Intercambia sus valores para que a sea 7 y b sea 3.",
          "starter": "a = 3\nb = 7\n# Intercambia sin perder el valor inicial de a\n",
          "tests": [
            {
              "check": "assert a == 7",
              "feedback": "a debe recibir el valor inicial de b."
            },
            {
              "check": "assert b == 3",
              "feedback": "Guarda el valor inicial de a antes de reemplazarlo."
            }
          ],
          "hints": [
            "Puedes usar una variable temporal.",
            "También existe la asignación múltiple a, b = b, a."
          ]
        }
      ],
      "pitfall": "Escribir Edad y leer edad produce un NameError: son nombres diferentes."
    },
    {
      "id": "numbers",
      "title": "Números, operadores y entrada",
      "module": 0,
      "minutes": 20,
      "source": "https://github.com/freeCodeCamp/freeCodeCamp/tree/main/curriculum/challenges/english/blocks/lecture-working-with-numbers-and-arithmetic-operators",
      "explanation": [
        "+ y - suman y restan; * y / multiplican y dividen. // calcula división entera y % obtiene el residuo. Los paréntesis hacen explícito el orden de una cuenta.",
        "input() devuelve texto. int() y float() convierten datos, pero pueden fallar si el texto no representa un número. Ejecuta, escribe tu respuesta junto a la pregunta en la consola y pulsa Enter, tanto en la web como en la app."
      ],
      "keyPoints": [
        "Usa float para cantidades con decimales.",
        "% ayuda a reconocer pares y múltiplos.",
        "Redondea en el punto exigido por el problema."
      ],
      "examples": [
        {
          "title": "Cociente y residuo",
          "code": "print(17 // 5)\nprint(17 % 5)",
          "output": "3\n2",
          "explanation": "17 contiene tres grupos de cinco y sobran dos."
        },
        {
          "title": "Convertir antes de sumar",
          "code": "texto = \"12\"\nnumero = int(texto)\nprint(numero + 3)",
          "output": "15",
          "explanation": "Sin int(), sumar texto y entero produce TypeError."
        }
      ],
      "quiz": [
        {
          "prompt": "¿Qué devuelve input()?",
          "choices": [
            "Siempre int",
            "Siempre float",
            "str",
            "bool"
          ],
          "answer": 2,
          "explanation": "Incluso una respuesta como 18 entra inicialmente como texto."
        },
        {
          "prompt": "¿Cuánto vale 11 % 4?",
          "choices": [
            "2",
            "3",
            "4",
            "2.75"
          ],
          "answer": 1,
          "explanation": "Dos grupos de cuatro suman ocho; sobran tres."
        },
        {
          "prompt": "¿Qué expresión vale 14?",
          "choices": [
            "(2+3)*4",
            "2+3*4",
            "2*(3+4)*2",
            "14/2"
          ],
          "answer": 1,
          "explanation": "La multiplicación se resuelve antes de la suma."
        }
      ],
      "exercises": [
        {
          "id": "seconds",
          "title": "Minutos y segundos",
          "prompt": "A partir de segundos = 125, calcula minutos_completos y segundos_restantes.",
          "starter": "segundos = 125\nminutos_completos = 0\nsegundos_restantes = 0\n",
          "tests": [
            {
              "check": "assert minutos_completos == 2",
              "feedback": "Usa división entera entre 60."
            },
            {
              "check": "assert segundos_restantes == 5",
              "feedback": "El residuo entre 60 indica lo que sobra."
            }
          ],
          "hints": [
            "// descarta la parte fraccionaria.",
            "% obtiene el residuo."
          ]
        },
        {
          "id": "receipt",
          "title": "Un recibo sencillo",
          "prompt": "Con precio = 12.5 y cantidad = 3, calcula subtotal, iva al 16% y total. Redondea iva y total a dos decimales.",
          "starter": "precio = 12.5\ncantidad = 3\n",
          "tests": [
            {
              "check": "assert subtotal == 37.5",
              "feedback": "Multiplica precio por cantidad."
            },
            {
              "check": "assert iva == 6.0",
              "feedback": "El 16% se expresa como 0.16."
            },
            {
              "check": "assert total == 43.5",
              "feedback": "Suma subtotal e iva."
            }
          ],
          "hints": [
            "Calcula un paso por línea.",
            "Comprueba a mano un recibo pequeño."
          ]
        }
      ],
      "pitfall": "int(\"3.5\") falla: el texto no representa un entero. float(\"3.5\") sí permite ese decimal."
    },
    {
      "id": "strings",
      "title": "Cadenas y formato",
      "module": 0,
      "minutes": 20,
      "source": "https://github.com/freeCodeCamp/freeCodeCamp/tree/main/curriculum/challenges/english/blocks/lecture-introduction-to-python-strings",
      "explanation": [
        "Una cadena es una secuencia inmutable: sus métodos devuelven otra cadena. strip() quita espacios externos, lower() cambia a minúsculas y split() separa palabras.",
        "Los índices empiezan en cero. Una f-string interpola valores entre llaves; sus expresiones se evalúan al construir el texto. No cambies el contenido original si debes conservarlo."
      ],
      "keyPoints": [
        "Reasigna el resultado de un método si quieres conservarlo.",
        "len() cuenta caracteres, incluidos espacios.",
        "Los cortes excluyen el extremo derecho."
      ],
      "examples": [
        {
          "title": "Limpiar un nombre",
          "code": "original = \"  ana  \"\nlimpio = original.strip().title()\nprint(limpio)\nprint(len(original))",
          "output": "Ana\n7",
          "explanation": "strip no cambia original; devuelve el texto limpio."
        },
        {
          "title": "Índices y formato",
          "code": "palabra = \"Python\"\nprint(palabra[0:3])\nprint(f\"Tiene {len(palabra)} letras\")",
          "output": "Pyt\nTiene 6 letras",
          "explanation": "El corte incluye posiciones 0, 1 y 2; excluye la 3."
        }
      ],
      "quiz": [
        {
          "prompt": "¿Qué devuelve \" hola \".strip()?",
          "choices": [
            " hola ",
            "hola",
            "HOLA",
            "h o l a"
          ],
          "answer": 1,
          "explanation": "Solo elimina espacios externos, sin cambiar mayúsculas."
        },
        {
          "prompt": "¿Qué vale \"Python\"[1]?",
          "choices": [
            "P",
            "y",
            "t",
            "1"
          ],
          "answer": 1,
          "explanation": "La posición 0 contiene P y la 1 contiene y."
        },
        {
          "prompt": "¿Qué produce \"a b\".split()?",
          "choices": [
            "\"ab\"",
            "[\"a\", \"b\"]",
            "2",
            "(\"a\", \"b\")"
          ],
          "answer": 1,
          "explanation": "Sin argumento, split separa por espacios en blanco y devuelve una lista."
        }
      ],
      "exercises": [
        {
          "id": "clean-email",
          "title": "Normaliza un correo",
          "prompt": "A partir de correo = \"  ANA@EJEMPLO.COM  \", guarda correo_limpio sin espacios y en minúsculas.",
          "starter": "correo = \"  ANA@EJEMPLO.COM  \"\n",
          "tests": [
            {
              "check": "assert correo_limpio == \"ana@ejemplo.com\"",
              "feedback": "Combina strip() con lower()."
            },
            {
              "check": "assert correo == \"  ANA@EJEMPLO.COM  \"",
              "feedback": "Conserva también el texto original."
            }
          ],
          "hints": [
            "Cada método devuelve otra cadena.",
            "Guarda el resultado en correo_limpio."
          ]
        },
        {
          "id": "initials",
          "title": "Iniciales de un nombre",
          "prompt": "Con nombre = \"Ana\" y apellido = \"Torres\", crea iniciales = \"AT\" y saludo = \"Hola, Ana Torres!\".",
          "starter": "nombre = \"Ana\"\napellido = \"Torres\"\n",
          "tests": [
            {
              "check": "assert iniciales == \"AT\"",
              "feedback": "El primer carácter usa índice 0."
            },
            {
              "check": "assert saludo == \"Hola, Ana Torres!\"",
              "feedback": "Cuida el espacio, la coma y el signo final."
            }
          ],
          "hints": [
            "Puedes concatenar dos caracteres con +.",
            "Una f-string facilita el saludo."
          ]
        }
      ],
      "pitfall": "Un índice igual a len(texto) queda fuera de rango. El último índice válido es len(texto) - 1."
    },
    {
      "id": "booleans",
      "title": "Comparaciones y lógica",
      "module": 1,
      "minutes": 20,
      "source": "https://github.com/freeCodeCamp/freeCodeCamp/tree/main/curriculum/challenges/english/blocks/control-flow-and-functions-in-python",
      "explanation": [
        "Las comparaciones devuelven True o False. == comprueba igualdad; != diferencia. Usa and cuando ambas condiciones deban cumplirse y or cuando baste una.",
        "Los límites cambian el resultado: > no incluye el límite y >= sí. Prueba justo antes, en el límite y justo después para evitar errores de interpretación."
      ],
      "keyPoints": [
        "= y == hacen trabajos distintos.",
        "and exige ambas condiciones.",
        "not invierte una condición."
      ],
      "examples": [
        {
          "title": "Un intervalo",
          "code": "edad = 18\nprint(edad >= 18 and edad <= 65)\nprint(edad > 18)",
          "output": "True\nFalse",
          "explanation": "La primera condición incluye 18; la segunda lo excluye."
        },
        {
          "title": "Alternativas",
          "code": "dia = \"domingo\"\nprint(dia == \"sábado\" or dia == \"domingo\")",
          "output": "True",
          "explanation": "Basta que una de las dos comparaciones sea verdadera."
        }
      ],
      "quiz": [
        {
          "prompt": "True and False vale…",
          "choices": [
            "True",
            "False",
            "None",
            "Error"
          ],
          "answer": 1,
          "explanation": "and requiere que ambos operandos sean verdaderos."
        },
        {
          "prompt": "¿Qué incluye exactamente 10?",
          "choices": [
            "x > 10",
            "x < 10",
            "x >= 10",
            "x != 10"
          ],
          "answer": 2,
          "explanation": ">= incluye el propio límite."
        },
        {
          "prompt": "¿Qué condición reconoce el texto sí o s?",
          "choices": [
            "respuesta == \"sí\" or \"s\"",
            "respuesta == \"sí\" or respuesta == \"s\"",
            "respuesta = \"sí\"",
            "respuesta == (\"sí\", \"s\")"
          ],
          "answer": 1,
          "explanation": "Debes comparar la variable en cada alternativa; una cadena no vacía sola es verdadera."
        }
      ],
      "exercises": [
        {
          "id": "access",
          "title": "Regla de acceso",
          "prompt": "Con edad = 18 y tiene_permiso = True, guarda puede_entrar si edad >= 18 y tiene permiso.",
          "starter": "edad = 18\ntiene_permiso = True\n",
          "tests": [
            {
              "check": "assert puede_entrar is True",
              "feedback": "Combina ambas condiciones con and."
            },
            {
              "check": "assert type(puede_entrar) is bool",
              "feedback": "Guarda el resultado booleano, no un texto."
            }
          ],
          "hints": [
            "Compara edad con 18.",
            "El permiso ya es un booleano."
          ]
        },
        {
          "id": "range-check",
          "title": "Un dato dentro del rango",
          "prompt": "Con temperatura = 25, guarda en_rango para el intervalo inclusivo 18 a 26 y fuera_rango como su negación.",
          "starter": "temperatura = 25\n",
          "tests": [
            {
              "check": "assert en_rango is True",
              "feedback": "Incluye ambos extremos."
            },
            {
              "check": "assert fuera_rango is False",
              "feedback": "Usa not sobre en_rango."
            }
          ],
          "hints": [
            "Puedes usar dos comparaciones y and.",
            "Python también admite 18 <= temperatura <= 26."
          ]
        }
      ],
      "pitfall": "if x == 1 or 2 siempre entra porque 2 es verdadero. Compara x con cada valor."
    },
    {
      "id": "conditions",
      "title": "Decisiones con if",
      "module": 1,
      "minutes": 20,
      "source": "https://github.com/freeCodeCamp/freeCodeCamp/tree/main/curriculum/challenges/english/blocks/control-flow-and-functions-in-python",
      "explanation": [
        "if elige un bloque; elif ofrece otra condición y else cubre lo que no se cumplió. Solo se ejecuta la primera rama verdadera dentro de una misma cadena.",
        "Un bloque empieza con : y se sangra con cuatro espacios. Ordena primero los casos más específicos o los límites más altos para que una condición general no los oculte."
      ],
      "keyPoints": [
        "Usa elif para alternativas excluyentes.",
        "La sangría forma parte de la sintaxis.",
        "Comprueba los límites con datos pequeños."
      ],
      "examples": [
        {
          "title": "Orden de las ramas",
          "code": "nota = 95\nif nota >= 90:\n    categoria = \"alta\"\nelif nota >= 60:\n    categoria = \"media\"\nelse:\n    categoria = \"baja\"\nprint(categoria)",
          "output": "alta",
          "explanation": "La primera rama ya decide; no se evalúa la segunda."
        },
        {
          "title": "Valor vacío",
          "code": "nombre = \"\"\nif nombre:\n    print(nombre)\nelse:\n    print(\"Sin nombre\")",
          "output": "Sin nombre",
          "explanation": "Una cadena vacía se considera falsa."
        }
      ],
      "quiz": [
        {
          "prompt": "En if/elif, ¿cuántas ramas se ejecutan?",
          "choices": [
            "Siempre todas",
            "Como máximo una",
            "Exactamente dos",
            "Ninguna"
          ],
          "answer": 1,
          "explanation": "Se usa la primera verdadera o else si ninguna se cumple."
        },
        {
          "prompt": "¿Qué falta en if edad >= 18?",
          "choices": [
            "Un punto",
            "Dos puntos al final",
            "Un punto y coma",
            "Una llave"
          ],
          "answer": 1,
          "explanation": "Los dos puntos introducen el bloque."
        },
        {
          "prompt": "¿Por qué comprobar >=90 antes de >=60?",
          "choices": [
            "Por estética",
            "Para que el caso general no capture notas altas",
            "Porque Python lo exige",
            "Da igual en todos los programas"
          ],
          "answer": 1,
          "explanation": "Una nota de 95 cumple ambas condiciones: la primera determina la rama."
        }
      ],
      "exercises": [
        {
          "id": "grade",
          "title": "Clasifica una nota",
          "prompt": "Con nota = 90, asigna resultado: \"excelente\" desde 90, \"aprobado\" desde 60 y \"repasar\" en otro caso.",
          "starter": "nota = 90\n",
          "tests": [
            {
              "check": "assert resultado == \"excelente\"",
              "feedback": "Incluye 90 en excelente."
            },
            {
              "check": "assert nota == 90",
              "feedback": "Conserva la nota recibida."
            }
          ],
          "hints": [
            "Empieza por el límite más alto.",
            "Cada rama debe asignar resultado."
          ]
        },
        {
          "id": "shipping",
          "title": "Costo de envío",
          "prompt": "Con compra = 450 y es_socio = False, guarda envio = 0 si la compra llega a 500 o es socio; en otro caso, 50.",
          "starter": "compra = 450\nes_socio = False\n",
          "tests": [
            {
              "check": "assert envio == 50",
              "feedback": "450 sin membresía debe pagar 50."
            },
            {
              "check": "assert isinstance(envio, int)",
              "feedback": "Usa un valor numérico para poder sumarlo a la compra."
            }
          ],
          "hints": [
            "Basta una de las condiciones para envío gratuito.",
            "No confundas or con and."
          ]
        }
      ],
      "pitfall": "Varios if independientes pueden ejecutar varios bloques; if/elif representa una sola elección."
    },
    {
      "id": "for-loops",
      "title": "Bucles for y range",
      "module": 1,
      "minutes": 20,
      "source": "https://github.com/freeCodeCamp/freeCodeCamp/tree/main/curriculum/challenges/english/blocks/lecture-working-with-loops-python",
      "explanation": [
        "for recorre elementos de una secuencia. range(inicio, fin, paso) genera enteros y excluye fin. Puedes recorrer una lista directamente cuando no necesitas su índice.",
        "Un acumulador se inicializa antes del bucle. Si lo reinicias dentro, pierdes lo acumulado. Prueba secuencias vacías, un elemento y varios elementos."
      ],
      "keyPoints": [
        "range(3) produce 0, 1, 2.",
        "El acumulador se crea antes del ciclo.",
        "Recorre valores directamente si basta con ellos."
      ],
      "examples": [
        {
          "title": "Un acumulador",
          "code": "total = 0\nfor n in range(1, 4):\n    total += n\nprint(total)",
          "output": "6",
          "explanation": "El total cambia 0 → 1 → 3 → 6."
        },
        {
          "title": "Un recorrido con paso",
          "code": "for n in range(2, 7, 2):\n    print(n)",
          "output": "2\n4\n6",
          "explanation": "El extremo 7 no se incluye; el paso avanza de dos en dos."
        }
      ],
      "quiz": [
        {
          "prompt": "list(range(1,4)) vale…",
          "choices": [
            "[1,2,3,4]",
            "[0,1,2,3]",
            "[1,2,3]",
            "[4]"
          ],
          "answer": 2,
          "explanation": "El extremo derecho se excluye."
        },
        {
          "prompt": "¿Dónde se inicia un acumulador?",
          "choices": [
            "Después del bucle",
            "Dentro en cada vuelta",
            "Antes del bucle",
            "No hace falta"
          ],
          "answer": 2,
          "explanation": "Debe conservar el resultado de las iteraciones anteriores."
        },
        {
          "prompt": "¿Cuántas vueltas hace for x in []?",
          "choices": [
            "Una",
            "Cero",
            "Infinita",
            "Da error"
          ],
          "answer": 1,
          "explanation": "No hay elementos que recorrer."
        }
      ],
      "exercises": [
        {
          "id": "sum-1-10",
          "title": "Suma del uno al diez",
          "prompt": "Guarda en total la suma de 1 a 10, ambos incluidos, usando un bucle.",
          "starter": "total = 0\n",
          "tests": [
            {
              "check": "assert total == 55",
              "feedback": "Incluye el 10 usando un fin de 11."
            },
            {
              "check": "assert isinstance(total,int)",
              "feedback": "El resultado debe ser entero."
            }
          ],
          "hints": [
            "Empieza el acumulador en cero.",
            "Observa total en cada vuelta si te pierdes."
          ]
        },
        {
          "id": "count-vowels",
          "title": "Cuenta vocales",
          "prompt": "Con texto = \"programar\", cuenta las letras a, e, i, o, u en vocales.",
          "starter": "texto = \"programar\"\nvocales = 0\n",
          "tests": [
            {
              "check": "assert vocales == 3",
              "feedback": "programar contiene o, a, a."
            },
            {
              "check": "assert texto == \"programar\"",
              "feedback": "No necesitas modificar el texto."
            }
          ],
          "hints": [
            "Recorre cada letra.",
            "in permite saber si una letra está entre las vocales."
          ]
        }
      ],
      "pitfall": "range(1,10) no incluye 10. Haz una lista de los valores para revisar el límite."
    },
    {
      "id": "while-loops",
      "title": "Bucles while y terminación",
      "module": 1,
      "minutes": 20,
      "source": "https://github.com/freeCodeCamp/freeCodeCamp/tree/main/curriculum/challenges/english/blocks/lecture-working-with-loops-python",
      "explanation": [
        "while repite mientras su condición sea verdadera. La condición se comprueba antes de cada vuelta, por lo que el cuerpo puede no ejecutarse.",
        "El estado debe acercarse a una salida. break termina el bucle; continue omite lo que queda de esa vuelta. Escribe primero cómo termina tu programa y después cómo avanza."
      ],
      "keyPoints": [
        "Define una condición de salida alcanzable.",
        "Actualiza el contador en cada vuelta necesaria.",
        "Detener permite salir de un programa que no termina."
      ],
      "examples": [
        {
          "title": "Cuenta regresiva",
          "code": "n = 3\nwhile n > 0:\n    print(n)\n    n -= 1",
          "output": "3\n2\n1",
          "explanation": "Al llegar a cero, la condición deja de cumplirse."
        },
        {
          "title": "Salida anticipada",
          "code": "for n in [2, 4, 7, 8]:\n    if n % 2:\n        print(n)\n        break",
          "output": "7",
          "explanation": "break detiene la búsqueda al encontrar el primer impar."
        }
      ],
      "quiz": [
        {
          "prompt": "¿Qué evita un while infinito de contador?",
          "choices": [
            "Usar print",
            "Actualizar el contador hacia la salida",
            "Añadir un comentario",
            "Poner True siempre"
          ],
          "answer": 1,
          "explanation": "La condición debe poder cambiar a falsa."
        },
        {
          "prompt": "¿Qué hace break?",
          "choices": [
            "Reinicia el programa",
            "Sale del bucle actual",
            "Omite solo un print",
            "Devuelve una cadena"
          ],
          "answer": 1,
          "explanation": "Continúa después del bucle."
        },
        {
          "prompt": "¿Cuántas vueltas hace while False?",
          "choices": [
            "Cero",
            "Una",
            "Dos",
            "Infinitas"
          ],
          "answer": 0,
          "explanation": "La condición se comprueba antes del cuerpo."
        }
      ],
      "exercises": [
        {
          "id": "double",
          "title": "Duplica hasta alcanzar un límite",
          "prompt": "Empieza con valor = 1. Duplicándolo en un while, llega al primer valor >= 20. Cuenta las duplicaciones en pasos.",
          "starter": "valor = 1\npasos = 0\n",
          "tests": [
            {
              "check": "assert valor == 32",
              "feedback": "La secuencia es 1, 2, 4, 8, 16, 32."
            },
            {
              "check": "assert pasos == 5",
              "feedback": "Cuenta cada multiplicación, no el estado inicial."
            }
          ],
          "hints": [
            "La condición debe comprobar valor < 20.",
            "Actualiza valor y pasos dentro del bloque."
          ]
        },
        {
          "id": "digits",
          "title": "Cuenta cifras",
          "prompt": "Con numero = 5072, usa división entera en un while para contar sus cuatro cifras en cifras. Conserva numero.",
          "starter": "numero = 5072\ncifras = 0\n",
          "tests": [
            {
              "check": "assert cifras == 4",
              "feedback": "Cada división entera entre 10 elimina una cifra."
            },
            {
              "check": "assert numero == 5072",
              "feedback": "Trabaja con una copia para conservar el original."
            }
          ],
          "hints": [
            "Usa una variable auxiliar.",
            "La salida se alcanza cuando la copia llega a cero."
          ]
        }
      ],
      "pitfall": "Si continue aparece antes de actualizar el contador, puede impedir que el bucle avance."
    },
    {
      "id": "lists",
      "title": "Listas y mutabilidad",
      "module": 2,
      "minutes": 20,
      "source": "https://github.com/freeCodeCamp/freeCodeCamp/tree/main/curriculum/challenges/english/blocks/core-primitives-in-python",
      "explanation": [
        "Una lista conserva elementos ordenados y permite cambiarlos. append() agrega al final; len() indica su tamaño. Copiar una referencia no crea otra lista independiente.",
        "Evita eliminar elementos de una lista mientras la recorres: los índices cambian y puedes saltarte datos. Construye una nueva lista o recorre una copia."
      ],
      "keyPoints": [
        "El primer índice es 0.",
        "append() modifica la lista y devuelve None.",
        "lista.copy() crea una copia superficial."
      ],
      "examples": [
        {
          "title": "Una referencia compartida",
          "code": "a = [1, 2]\nb = a\nb.append(3)\nprint(a)",
          "output": "[1, 2, 3]",
          "explanation": "Ambos nombres apuntan a la misma lista."
        },
        {
          "title": "Filtrar sin destruir",
          "code": "datos = [-1, 3, 0, 5]\npositivos = []\nfor n in datos:\n    if n > 0:\n        positivos.append(n)\nprint(positivos)",
          "output": "[3, 5]",
          "explanation": "La lista original se conserva; el resultado contiene solo los positivos."
        }
      ],
      "quiz": [
        {
          "prompt": "¿Qué devuelve lista.append(3)?",
          "choices": [
            "La lista nueva",
            "3",
            "None",
            "True"
          ],
          "answer": 2,
          "explanation": "append modifica la lista; no debes reasignar su retorno a la propia lista."
        },
        {
          "prompt": "a=[1]; b=a; b.append(2). ¿a?",
          "choices": [
            "[1]",
            "[1,2]",
            "[2]",
            "None"
          ],
          "answer": 1,
          "explanation": "a y b comparten el mismo objeto."
        },
        {
          "prompt": "¿Cómo copias una lista simple?",
          "choices": [
            "b=a",
            "b=a.copy()",
            "b=copy",
            "b=a.append()"
          ],
          "answer": 1,
          "explanation": "copy crea otra lista, aunque los objetos internos pueden seguir compartidos."
        }
      ],
      "exercises": [
        {
          "id": "positive-list",
          "title": "Separa valores positivos",
          "prompt": "A partir de datos = [-2, 0, 3, 5, -1], crea positivos = [3, 5] sin modificar datos.",
          "starter": "datos = [-2, 0, 3, 5, -1]\npositivos = []\n",
          "tests": [
            {
              "check": "assert positivos == [3,5]",
              "feedback": "Cero no es positivo."
            },
            {
              "check": "assert datos == [-2,0,3,5,-1]",
              "feedback": "Conserva la lista original."
            }
          ],
          "hints": [
            "Construye una lista vacía y agrega los valores válidos.",
            "Comprueba n > 0."
          ]
        },
        {
          "id": "copy-list",
          "title": "Una copia independiente",
          "prompt": "Crea original = [10,20], haz una copia ampliada y agrega 30 solo a ampliada.",
          "starter": "original = [10, 20]\n",
          "tests": [
            {
              "check": "assert original == [10,20]",
              "feedback": "El original no debe cambiar."
            },
            {
              "check": "assert ampliada == [10,20,30]",
              "feedback": "Agrega 30 al final de la copia."
            },
            {
              "check": "assert ampliada is not original",
              "feedback": "La copia debe ser otro objeto."
            }
          ],
          "hints": [
            "Usa .copy() o un corte completo [:].",
            "Una asignación simple comparte la referencia."
          ]
        }
      ],
      "pitfall": "datos = datos.append(3) deja datos como None. Llama append sin reasignar."
    },
    {
      "id": "sets-tuples",
      "title": "Tuplas y conjuntos",
      "module": 2,
      "minutes": 20,
      "source": "https://github.com/freeCodeCamp/freeCodeCamp/tree/main/curriculum/challenges/english/blocks/core-primitives-in-python",
      "explanation": [
        "Una tupla agrupa valores y no permite reemplazar sus posiciones. Es útil para coordenadas o resultados relacionados. Una tupla con un solo elemento necesita coma: (3,).",
        "Un set conserva elementos únicos y no garantiza un orden de presentación para tu lógica. Puedes unir con |, intersectar con & y ordenar el resultado con sorted()."
      ],
      "keyPoints": [
        "Las tuplas pueden desempaquetarse.",
        "Los conjuntos eliminan duplicados.",
        "Ordena un set si el resultado requiere orden."
      ],
      "examples": [
        {
          "title": "Desempaquetar",
          "code": "punto = (3, 5)\nx, y = punto\nprint(x + y)",
          "output": "8",
          "explanation": "Cada nombre recibe la posición correspondiente."
        },
        {
          "title": "Intersección",
          "code": "a = {1, 2, 3}\nb = {2, 3, 4}\nprint(sorted(a & b))",
          "output": "[2, 3]",
          "explanation": "La intersección contiene los elementos presentes en ambos conjuntos."
        }
      ],
      "quiz": [
        {
          "prompt": "¿Cuál es una tupla de un elemento?",
          "choices": [
            "(3)",
            "(3,)",
            "[3]",
            "{3}"
          ],
          "answer": 1,
          "explanation": "La coma distingue la tupla de una expresión entre paréntesis."
        },
        {
          "prompt": "¿Qué elimina duplicados?",
          "choices": [
            "list",
            "str",
            "set",
            "float"
          ],
          "answer": 2,
          "explanation": "Un set conserva valores únicos."
        },
        {
          "prompt": "¿Qué representa a & b para sets?",
          "choices": [
            "Unión",
            "Diferencia",
            "Intersección",
            "Suma"
          ],
          "answer": 2,
          "explanation": "Son los elementos compartidos."
        }
      ],
      "exercises": [
        {
          "id": "unique-values",
          "title": "Valores únicos ordenados",
          "prompt": "Con datos = [3,1,3,2,1], crea unicos = [1,2,3].",
          "starter": "datos = [3, 1, 3, 2, 1]\n",
          "tests": [
            {
              "check": "assert unicos == [1,2,3]",
              "feedback": "Elimina duplicados y luego ordena."
            },
            {
              "check": "assert datos == [3,1,3,2,1]",
              "feedback": "No modifiques los datos de entrada."
            }
          ],
          "hints": [
            "set elimina repeticiones.",
            "sorted devuelve una lista ordenada."
          ]
        },
        {
          "id": "common-students",
          "title": "Coincidencias entre grupos",
          "prompt": "Con a = {\"Ana\",\"Luis\"} y b = {\"Luis\",\"Eva\"}, crea comunes = {\"Luis\"} y todos con los tres nombres.",
          "starter": "a = {\"Ana\", \"Luis\"}\nb = {\"Luis\", \"Eva\"}\n",
          "tests": [
            {
              "check": "assert comunes == {\"Luis\"}",
              "feedback": "Usa la intersección."
            },
            {
              "check": "assert todos == {\"Ana\",\"Luis\",\"Eva\"}",
              "feedback": "La unión no repite Luis."
            }
          ],
          "hints": [
            "& conserva coincidencias.",
            "| reúne ambos grupos."
          ]
        }
      ],
      "pitfall": "No uses el orden de impresión de un set para decidir posiciones de elementos."
    },
    {
      "id": "dictionaries",
      "title": "Diccionarios y conteos",
      "module": 2,
      "minutes": 20,
      "source": "https://github.com/freeCodeCamp/freeCodeCamp/tree/main/curriculum/challenges/english/blocks/core-primitives-in-python",
      "explanation": [
        "Un diccionario relaciona claves únicas con valores. datos[clave] exige que exista; datos.get(clave, alternativa) permite un valor por defecto.",
        "Para contar repeticiones, lee el conteo anterior y suma uno. items() permite recorrer claves y valores juntos. Elige una normalización consistente antes de comparar textos."
      ],
      "keyPoints": [
        "Las claves deben ser únicas y hashables.",
        "get evita un KeyError cuando hay un valor alternativo válido.",
        "Normaliza antes de contar."
      ],
      "examples": [
        {
          "title": "Un valor alternativo",
          "code": "perfil = {\"nombre\": \"Ana\"}\nprint(perfil.get(\"edad\", 0))",
          "output": "0",
          "explanation": "La ausencia de edad no provoca error si el programa contempla ese caso."
        },
        {
          "title": "Contar letras",
          "code": "conteo = {}\nfor letra in \"casa\":\n    conteo[letra] = conteo.get(letra, 0) + 1\nprint(conteo[\"a\"])",
          "output": "2",
          "explanation": "La primera a parte de cero; la segunda incrementa el conteo existente."
        }
      ],
      "quiz": [
        {
          "prompt": "Si falta la clave, datos[clave]…",
          "choices": [
            "Devuelve 0",
            "Lanza KeyError",
            "Devuelve vacío",
            "Crea la clave"
          ],
          "answer": 1,
          "explanation": "Usa get si existe un valor alternativo definido por el problema."
        },
        {
          "prompt": "¿Qué recorre items()?",
          "choices": [
            "Solo claves",
            "Solo valores",
            "Pares clave y valor",
            "Índices"
          ],
          "answer": 2,
          "explanation": "Permite for clave, valor in datos.items()."
        },
        {
          "prompt": "¿Qué ocurre al asignar una clave existente?",
          "choices": [
            "Se duplica",
            "Se sustituye su valor",
            "Da error siempre",
            "Se ordenan las claves"
          ],
          "answer": 1,
          "explanation": "Cada clave representa un solo valor en el diccionario."
        }
      ],
      "exercises": [
        {
          "id": "word-count",
          "title": "Frecuencia de palabras",
          "prompt": "Con texto = \"Sol sol LUNA\", crea conteo = {\"sol\":2,\"luna\":1}.",
          "starter": "texto = \"Sol sol LUNA\"\nconteo = {}\n",
          "tests": [
            {
              "check": "assert conteo == {\"sol\":2,\"luna\":1}",
              "feedback": "Pasa el texto a minúsculas antes de separar."
            },
            {
              "check": "assert len(conteo) == 2",
              "feedback": "Sol y sol deben contarse bajo la misma clave."
            }
          ],
          "hints": [
            "lower() unifica mayúsculas.",
            "Usa get(palabra, 0) + 1."
          ]
        },
        {
          "id": "inventory-value",
          "title": "Valor de inventario",
          "prompt": "Con inventario = {\"lapiz\":3,\"libreta\":2} y precios = {\"lapiz\":5,\"libreta\":20}, calcula valor_total.",
          "starter": "inventario = {\"lapiz\":3, \"libreta\":2}\nprecios = {\"lapiz\":5, \"libreta\":20}\n",
          "tests": [
            {
              "check": "assert valor_total == 55",
              "feedback": "Suma cantidad por precio de cada producto."
            },
            {
              "check": "assert inventario[\"lapiz\"] == 3",
              "feedback": "No cambies las cantidades al consultar el valor."
            }
          ],
          "hints": [
            "Recorre inventario.items().",
            "Acumula cantidad * precios[nombre]."
          ]
        }
      ],
      "pitfall": "Una clave que aparece dos veces en un literal conserva solo el último valor."
    },
    {
      "id": "comprehensions",
      "title": "Comprensiones y transformaciones",
      "module": 2,
      "minutes": 20,
      "source": "https://github.com/freeCodeCamp/freeCodeCamp/tree/main/curriculum/challenges/english/blocks/control-flow-and-functions-in-python",
      "explanation": [
        "Una comprensión expresa cómo transformar cada elemento y, opcionalmente, cuáles conservar. [expresion for elemento in datos if condicion] produce una nueva lista.",
        "Usa un bucle normal cuando haya varios pasos, efectos secundarios o demasiadas condiciones. Una expresión corta solo ayuda si otra persona puede leerla fácilmente."
      ],
      "keyPoints": [
        "La expresión inicial transforma el elemento.",
        "El if final filtra elementos.",
        "Conserva la claridad por encima de ahorrar líneas."
      ],
      "examples": [
        {
          "title": "Transformar",
          "code": "cuadrados = [n*n for n in range(1,4)]\nprint(cuadrados)",
          "output": "[1, 4, 9]",
          "explanation": "Cada elemento del recorrido se eleva al cuadrado."
        },
        {
          "title": "Filtrar y transformar",
          "code": "datos = [-2, 1, 3]\nprint([n*2 for n in datos if n>0])",
          "output": "[2, 6]",
          "explanation": "Solo pasan los positivos y luego se duplican."
        }
      ],
      "quiz": [
        {
          "prompt": "¿Qué hace el if al final?",
          "choices": [
            "Transforma",
            "Filtra",
            "Termina Python",
            "Ordena"
          ],
          "answer": 1,
          "explanation": "Decide qué elementos entran al resultado."
        },
        {
          "prompt": "[n+1 for n in [1,2]] vale…",
          "choices": [
            "[1,2]",
            "[2,3]",
            "3",
            "[1,2,3]"
          ],
          "answer": 1,
          "explanation": "La expresión n+1 se aplica a cada valor."
        },
        {
          "prompt": "¿Cuándo conviene un bucle normal?",
          "choices": [
            "Nunca",
            "Cuando hay varios pasos difíciles de leer",
            "Solo con números",
            "Cuando no hay lista"
          ],
          "answer": 1,
          "explanation": "La comprensión no debe esconder una lógica complicada."
        }
      ],
      "exercises": [
        {
          "id": "squares-even",
          "title": "Cuadrados de los pares",
          "prompt": "Con datos = [1,2,3,4,5,6], crea cuadrados = [4,16,36].",
          "starter": "datos = [1, 2, 3, 4, 5, 6]\n",
          "tests": [
            {
              "check": "assert cuadrados == [4,16,36]",
              "feedback": "Filtra los pares y luego calcula su cuadrado."
            },
            {
              "check": "assert datos == [1,2,3,4,5,6]",
              "feedback": "La transformación no debe alterar la entrada."
            }
          ],
          "hints": [
            "n % 2 == 0 reconoce pares.",
            "La expresión de transformación es n*n."
          ]
        },
        {
          "id": "clean-names",
          "title": "Limpia una lista de nombres",
          "prompt": "Con datos = [\" ana \",\"\",\" LUIS \",\"  \"], crea nombres = [\"Ana\",\"Luis\"], sin textos vacíos.",
          "starter": "datos = [\" ana \", \"\", \" LUIS \", \"  \"]\n",
          "tests": [
            {
              "check": "assert nombres == [\"Ana\",\"Luis\"]",
              "feedback": "Quita espacios, excluye vacíos y aplica title()."
            },
            {
              "check": "assert len(nombres) == 2",
              "feedback": "Un texto con solo espacios también debe excluirse."
            }
          ],
          "hints": [
            "Comprueba n.strip() en la condición.",
            "La transformación es n.strip().title()."
          ]
        }
      ],
      "pitfall": "No confundas una comprensión que transforma con una que usa print(): print devuelve None."
    },
    {
      "id": "functions",
      "title": "Funciones, parámetros y retorno",
      "module": 3,
      "minutes": 20,
      "source": "https://github.com/freeCodeCamp/freeCodeCamp/tree/main/curriculum/challenges/english/blocks/control-flow-and-functions-in-python",
      "explanation": [
        "Una función reúne un comportamiento que puede repetirse con distintos argumentos. def define sus parámetros; return entrega un valor a quien la llama y termina esa ejecución.",
        "Mostrar con print no equivale a devolver. Una función sin return devuelve None. Diseña funciones pequeñas y comprueba sus resultados con varios datos, no solo con el ejemplo del enunciado."
      ],
      "keyPoints": [
        "Los argumentos se reciben en parámetros.",
        "return permite reutilizar el resultado.",
        "Una función debe tener un propósito claro."
      ],
      "examples": [
        {
          "title": "Devolver y reutilizar",
          "code": "def doble(n):\n    return n*2\nprint(doble(3) + doble(4))",
          "output": "14",
          "explanation": "Cada llamada devuelve un número que se usa en la suma."
        },
        {
          "title": "Un valor por defecto",
          "code": "def saludar(nombre=\"estudiante\"):\n    return f\"Hola, {nombre}\"\nprint(saludar())",
          "output": "Hola, estudiante",
          "explanation": "El valor por defecto se usa cuando no se pasa el argumento."
        }
      ],
      "quiz": [
        {
          "prompt": "Una función sin return devuelve…",
          "choices": [
            "0",
            "None",
            "El último print",
            "True"
          ],
          "answer": 1,
          "explanation": "Python devuelve None implícitamente."
        },
        {
          "prompt": "¿Qué hace return?",
          "choices": [
            "Solo imprime",
            "Entrega un valor y termina la llamada",
            "Repite el bucle",
            "Define una variable global"
          ],
          "answer": 1,
          "explanation": "El llamador recibe ese valor para usarlo."
        },
        {
          "prompt": "¿Cuántas veces puede llamarse una función?",
          "choices": [
            "Solo una",
            "Las veces que se necesite",
            "Solo dos",
            "Una por archivo"
          ],
          "answer": 1,
          "explanation": "Reutilizar comportamiento es uno de sus propósitos."
        }
      ],
      "exercises": [
        {
          "id": "function-total",
          "title": "Total con descuento",
          "prompt": "Crea total(precio, cantidad, descuento). descuento es un porcentaje entre 0 y 100. Devuelve el total con dos decimales.",
          "starter": "def total(precio, cantidad, descuento):\n    pass\n",
          "tests": [
            {
              "check": "assert total(10,3,10)==27",
              "feedback": "Aplica el descuento al subtotal."
            },
            {
              "check": "assert total(12.99,2,15)==22.08",
              "feedback": "Redondea a dos decimales."
            },
            {
              "check": "assert total(20,0,0)==0",
              "feedback": "Una cantidad cero produce cero."
            }
          ],
          "hints": [
            "Calcula precio * cantidad.",
            "El factor de descuento es 1 - descuento / 100."
          ]
        },
        {
          "id": "function-average",
          "title": "Promedio reutilizable",
          "prompt": "Crea promedio(numeros). Devuelve 0 para una lista vacía y el promedio para otra lista, sin modificarla.",
          "starter": "def promedio(numeros):\n    pass\n",
          "tests": [
            {
              "check": "assert promedio([2,4,6])==4",
              "feedback": "Divide la suma entre la cantidad."
            },
            {
              "check": "assert promedio([])==0",
              "feedback": "Evita dividir entre cero."
            },
            {
              "check": "datos=[1,3]; promedio(datos); assert datos==[1,3]",
              "feedback": "Conserva la lista original."
            }
          ],
          "hints": [
            "Comprueba si la lista está vacía.",
            "sum() y len() ayudan a expresar el cálculo."
          ]
        }
      ],
      "pitfall": "Una función que solo imprime puede mostrar la respuesta correcta pero seguir devolviendo None."
    },
    {
      "id": "scope",
      "title": "Alcance y diseño de funciones",
      "module": 3,
      "minutes": 20,
      "source": "https://github.com/freeCodeCamp/freeCodeCamp/tree/main/curriculum/challenges/english/blocks/control-flow-and-functions-in-python",
      "explanation": [
        "Una variable creada dentro de una función normalmente es local a esa llamada. Pasa los datos como argumentos y devuelve resultados en lugar de depender de variables globales.",
        "Los valores por defecto se evalúan al definir la función. Evita una lista mutable como valor por defecto si cada llamada debe empezar con una lista distinta. Usa None y crea la lista dentro."
      ],
      "keyPoints": [
        "Las variables locales no sustituyen automáticamente a las globales.",
        "Evita estado compartido accidental.",
        "No modifiques argumentos sin documentarlo."
      ],
      "examples": [
        {
          "title": "Alcance local",
          "code": "x = 10\ndef obtener():\n    x = 3\n    return x\nprint(obtener(), x)",
          "output": "3 10",
          "explanation": "El x local y el x del archivo son nombres en ámbitos distintos."
        },
        {
          "title": "Lista por llamada",
          "code": "def agregar(valor, datos=None):\n    if datos is None:\n        datos = []\n    return datos + [valor]\nprint(agregar(1))\nprint(agregar(2))",
          "output": "[1]\n[2]",
          "explanation": "Cada llamada sin lista recibe su propio estado."
        }
      ],
      "quiz": [
        {
          "prompt": "Una variable definida dentro de una función es normalmente…",
          "choices": [
            "Global",
            "Local",
            "Constante",
            "Un archivo"
          ],
          "answer": 1,
          "explanation": "Su alcance es la función en la que se creó."
        },
        {
          "prompt": "¿Qué valor por defecto es más seguro para una lista nueva?",
          "choices": [
            "[]",
            "None y crearla dentro",
            "list() en la definición",
            "Una lista global"
          ],
          "answer": 1,
          "explanation": "Los valores mutables por defecto pueden compartirse entre llamadas."
        },
        {
          "prompt": "Para evitar dependencias ocultas conviene…",
          "choices": [
            "Usar más globales",
            "Recibir datos por parámetros",
            "Leer siempre input()",
            "No usar return"
          ],
          "answer": 1,
          "explanation": "Los parámetros hacen explícitos los datos que necesita la función."
        }
      ],
      "exercises": [
        {
          "id": "independent-list",
          "title": "Llamadas independientes",
          "prompt": "Implementa agregar(valor, datos=None) que devuelve una nueva lista con valor al final, sin cambiar datos.",
          "starter": "def agregar(valor, datos=None):\n    pass\n",
          "tests": [
            {
              "check": "assert agregar(1)==[1] and agregar(2)==[2]",
              "feedback": "No compartas una lista por defecto."
            },
            {
              "check": "a=[3]; assert agregar(4,a)==[3,4] and a==[3]",
              "feedback": "Crea otra lista sin modificar el argumento."
            },
            {
              "check": "assert agregar(0,[])==[0]",
              "feedback": "Una lista vacía recibida también es válida."
            }
          ],
          "hints": [
            "Usa None como ausencia de argumento.",
            "Puedes concatenar una copia con [valor]."
          ]
        },
        {
          "id": "normalize-list",
          "title": "Función sin efectos sorpresa",
          "prompt": "Crea normalizar(nombres): devuelve nombres limpios, en minúsculas y sin vacíos; conserva la lista recibida.",
          "starter": "def normalizar(nombres):\n    pass\n",
          "tests": [
            {
              "check": "assert normalizar([\" ANA \",\"\",\" Luis \"])==[\"ana\",\"luis\"]",
              "feedback": "Limpia, filtra y normaliza."
            },
            {
              "check": "a=[\" X \"]; normalizar(a); assert a==[\" X \"]",
              "feedback": "No reasignes posiciones en la entrada."
            },
            {
              "check": "assert normalizar([])==[]",
              "feedback": "La lista vacía debe funcionar."
            }
          ],
          "hints": [
            "Construye una nueva lista.",
            "Reutiliza strip() y lower()."
          ]
        }
      ],
      "pitfall": "Usar datos=[] en la firma puede acumular resultados de llamadas anteriores."
    },
    {
      "id": "exceptions",
      "title": "Excepciones y validación",
      "module": 3,
      "minutes": 20,
      "source": "https://github.com/freeCodeCamp/freeCodeCamp/tree/main/curriculum/challenges/english/blocks/error-handling-files-and-modules-in-python",
      "explanation": [
        "try permite intentar una operación que puede fallar. except captura un tipo concreto de error. Elige una respuesta útil: informar, pedir otro dato o devolver un valor acordado.",
        "No captures todo para ocultar errores inesperados. Separa un dato inválido de un fallo del programa. finally es útil para liberar recursos aunque ocurra una excepción."
      ],
      "keyPoints": [
        "ValueError suele indicar un valor no convertible.",
        "ZeroDivisionError indica un divisor cero.",
        "Captura solo errores que sabes manejar."
      ],
      "examples": [
        {
          "title": "Convertir con un valor alternativo",
          "code": "try:\n    n = int(\"hola\")\nexcept ValueError:\n    n = None\nprint(n)",
          "output": "None",
          "explanation": "El programa reconoce una entrada inválida en vez de inventar un número."
        },
        {
          "title": "Dos tipos de fallo",
          "code": "def dividir(a,b):\n    try:\n        return float(a)/float(b)\n    except (ValueError, ZeroDivisionError):\n        return None\nprint(dividir(\"6\",\"0\"))",
          "output": "None",
          "explanation": "Se contemplan conversión y divisor cero como casos diferentes."
        }
      ],
      "quiz": [
        {
          "prompt": "int(\"hola\") genera normalmente…",
          "choices": [
            "NameError",
            "ValueError",
            "KeyError",
            "Ningún error"
          ],
          "answer": 1,
          "explanation": "La función existe, pero el contenido no puede convertirse a entero."
        },
        {
          "prompt": "¿Por qué evitar except sin tipo?",
          "choices": [
            "Es más lento siempre",
            "Puede ocultar errores inesperados",
            "Python no lo admite",
            "No captura nada"
          ],
          "answer": 1,
          "explanation": "Atrapa problemas que quizá deban corregirse o propagarse."
        },
        {
          "prompt": "finally sirve para…",
          "choices": [
            "Ejecutar solo si todo sale bien",
            "Ejecutar una limpieza aunque haya error",
            "Repetir try",
            "Borrar el error siempre"
          ],
          "answer": 1,
          "explanation": "Permite tareas de cierre y liberación de recursos."
        }
      ],
      "exercises": [
        {
          "id": "safe-division",
          "title": "División segura",
          "prompt": "Implementa dividir(a,b): convierte textos a float y devuelve el cociente; devuelve None si un texto es inválido o b es cero.",
          "starter": "def dividir(a, b):\n    pass\n",
          "tests": [
            {
              "check": "assert dividir(\"10\",\"4\")==2.5",
              "feedback": "Permite resultados decimales."
            },
            {
              "check": "assert dividir(\"3\",\"0\") is None",
              "feedback": "Contempla el divisor cero."
            },
            {
              "check": "assert dividir(\"hola\",\"2\") is None",
              "feedback": "Contempla el texto inválido."
            }
          ],
          "hints": [
            "Usa float() dentro de try.",
            "Captura ValueError y ZeroDivisionError."
          ]
        },
        {
          "id": "valid-age",
          "title": "Edad válida",
          "prompt": "Crea edad_valida(texto): devuelve un entero entre 0 y 120, o None si no puede convertirse o está fuera del rango.",
          "starter": "def edad_valida(texto):\n    pass\n",
          "tests": [
            {
              "check": "assert edad_valida(\"18\")==18",
              "feedback": "Convierte una edad válida."
            },
            {
              "check": "assert edad_valida(\"0\")==0 and edad_valida(\"120\")==120",
              "feedback": "Incluye los extremos."
            },
            {
              "check": "assert edad_valida(\"-1\") is None and edad_valida(\"121\") is None",
              "feedback": "Rechaza números fuera del rango."
            },
            {
              "check": "assert edad_valida(\"hola\") is None",
              "feedback": "Rechaza texto no numérico."
            }
          ],
          "hints": [
            "Primero convierte, después valida el rango.",
            "No uses 0 para representar un error: es una edad válida."
          ]
        }
      ],
      "pitfall": "Devolver 0 ante cualquier error puede confundir un dato válido con una entrada inválida."
    },
    {
      "id": "testing",
      "title": "Depurar y probar",
      "module": 3,
      "minutes": 20,
      "source": "https://github.com/freeCodeCamp/freeCodeCamp/tree/main/curriculum/challenges/english/blocks/error-handling-files-and-modules-in-python",
      "explanation": [
        "Una prueba compara el resultado real con el esperado. assert expresa una condición que debe cumplirse. Si falla, revisa los datos y la línea que produjo el resultado, no solo el mensaje final.",
        "Elige casos normales, vacíos, negativos y límites según el contrato. Una prueba superada aporta evidencia sobre ese caso; no demuestra que todos los programas posibles sean correctos."
      ],
      "keyPoints": [
        "Prueba primero un caso que puedas resolver a mano.",
        "Lee la última línea del traceback y la línea de tu archivo.",
        "Comprueba límites y conserva ejemplos de fallos."
      ],
      "examples": [
        {
          "title": "Un contrato comprobable",
          "code": "def cuadrado(n):\n    return n*n\nassert cuadrado(3)==9\nassert cuadrado(-2)==4\nprint(\"Pruebas completas\")",
          "output": "Pruebas completas",
          "explanation": "Se comprueban dos signos; un fallo detendría la ejecución con AssertionError."
        },
        {
          "title": "Detectar un límite",
          "code": "def es_mayor(edad):\n    return edad >= 18\nprint(es_mayor(17), es_mayor(18), es_mayor(19))",
          "output": "False True True",
          "explanation": "Los casos vecinos muestran si se incluyó el límite correcto."
        }
      ],
      "quiz": [
        {
          "prompt": "¿Qué demuestra una prueba superada?",
          "choices": [
            "Que nunca habrá errores",
            "Que ese caso produjo el resultado esperado",
            "Que hay autoría certificada",
            "Que el código es el más rápido"
          ],
          "answer": 1,
          "explanation": "La conclusión debe limitarse a los casos comprobados."
        },
        {
          "prompt": "Para un umbral de 18 conviene probar…",
          "choices": [
            "Solo 20",
            "17, 18 y 19",
            "Solo 18",
            "Cualquier texto"
          ],
          "answer": 1,
          "explanation": "Compruebas antes, exactamente en el límite y después."
        },
        {
          "prompt": "Un AssertionError significa…",
          "choices": [
            "El intérprete no existe",
            "La condición de una prueba no se cumplió",
            "No hay internet",
            "El archivo no se guardó"
          ],
          "answer": 1,
          "explanation": "Revisa el resultado real y el esperado."
        }
      ],
      "exercises": [
        {
          "id": "fix-boundary",
          "title": "Corrige el límite",
          "prompt": "La función debe devolver True desde los 18 años. Corrige el error de límite.",
          "starter": "def es_mayor(edad):\n    return edad > 18\n",
          "tests": [
            {
              "check": "assert es_mayor(17) is False",
              "feedback": "17 todavía no es mayor de edad."
            },
            {
              "check": "assert es_mayor(18) is True",
              "feedback": "El umbral incluye exactamente 18."
            },
            {
              "check": "assert es_mayor(19) is True",
              "feedback": "Una edad superior también debe pasar."
            }
          ],
          "hints": [
            "Compara > con >=.",
            "Prueba las tres edades vecinas."
          ]
        },
        {
          "id": "fix-maximum",
          "title": "Corrige un máximo",
          "prompt": "Devuelve el mayor valor de una lista de enteros; para una lista vacía, None. La versión inicial falla con negativos.",
          "starter": "def maximo(datos):\n    mayor = 0\n    for n in datos:\n        if n > mayor:\n            mayor = n\n    return mayor\n",
          "tests": [
            {
              "check": "assert maximo([-5,-2,-9])==-2",
              "feedback": "No inicialices el máximo en cero para datos negativos."
            },
            {
              "check": "assert maximo([4,1,9])==9",
              "feedback": "Conserva el caso normal."
            },
            {
              "check": "assert maximo([]) is None",
              "feedback": "Acuerda una respuesta para la lista vacía."
            },
            {
              "check": "assert maximo([0])==0",
              "feedback": "Cero puede ser un resultado válido."
            }
          ],
          "hints": [
            "Si hay elementos, el primero es un candidato válido.",
            "También puedes usar max() tras comprobar la lista vacía."
          ]
        }
      ],
      "pitfall": "No cambies una prueba solo para que el programa pase: verifica primero qué exige el enunciado."
    },
    {
      "id": "files",
      "title": "Archivos de texto",
      "module": 4,
      "minutes": 20,
      "source": "https://github.com/freeCodeCamp/freeCodeCamp/tree/main/curriculum/challenges/english/blocks/error-handling-files-and-modules-in-python",
      "explanation": [
        "open() abre un recurso y with garantiza su cierre. Define encoding=\"utf-8\" para texto portable. El modo w reemplaza el contenido; a agrega y r solo lee.",
        "Las rutas relativas parten de la carpeta del proyecto. Evita nombres absolutos de tu equipo. En el navegador los archivos del programa pertenecen al sistema virtual de Python; exporta los datos que debas conservar fuera de la sesión."
      ],
      "keyPoints": [
        "Usa with para cerrar archivos.",
        "Indica UTF-8 para texto.",
        "w sobrescribe; no lo uses para conservar contenido previo."
      ],
      "examples": [
        {
          "title": "Escribir y leer",
          "code": "with open(\"saludo.txt\",\"w\",encoding=\"utf-8\") as f:\n    f.write(\"Hola, José\")\nwith open(\"saludo.txt\",encoding=\"utf-8\") as f:\n    print(f.read())",
          "output": "Hola, José",
          "explanation": "El texto con acento se conserva gracias a la codificación explícita."
        },
        {
          "title": "Procesar líneas",
          "code": "from io import StringIO\narchivo = StringIO(\"uno\\ndos\\n\")\nfor linea in archivo:\n    print(linea.strip())",
          "output": "uno\ndos",
          "explanation": "StringIO permite practicar un flujo de texto sin depender de un archivo externo."
        }
      ],
      "quiz": [
        {
          "prompt": "¿Qué hace el modo w si el archivo existe?",
          "choices": [
            "Solo lee",
            "Sobrescribe",
            "Agrega siempre",
            "No hace nada"
          ],
          "answer": 1,
          "explanation": "w trunca el archivo; para agregar existe a."
        },
        {
          "prompt": "¿Para qué sirve with?",
          "choices": [
            "Para evitar nombres",
            "Para cerrar el recurso al salir del bloque",
            "Para cifrar texto",
            "Para crear una lista"
          ],
          "answer": 1,
          "explanation": "El cierre ocurre incluso si el bloque termina con una excepción."
        },
        {
          "prompt": "¿Qué codificación ayuda con acentos?",
          "choices": [
            "UTF-8",
            "Ninguna",
            "Solo ASCII",
            "Depende del nombre de variable"
          ],
          "answer": 0,
          "explanation": "UTF-8 representa texto de distintos idiomas y debe elegirse de forma consistente."
        }
      ],
      "exercises": [
        {
          "id": "nonempty-lines",
          "title": "Lee líneas útiles",
          "prompt": "Crea lineas_utiles(texto): devuelve las líneas sin espacios externos y omite las vacías. Usa splitlines() o StringIO.",
          "starter": "def lineas_utiles(texto):\n    pass\n",
          "tests": [
            {
              "check": "assert lineas_utiles(\" uno\\n\\n dos \")==[\"uno\",\"dos\"]",
              "feedback": "Quita espacios y omite líneas vacías."
            },
            {
              "check": "assert lineas_utiles(\"\")==[]",
              "feedback": "Un archivo vacío no tiene líneas útiles."
            },
            {
              "check": "assert lineas_utiles(\"José\\r\\nAna\")==[\"José\",\"Ana\"]",
              "feedback": "Permite acentos y finales de línea de Windows."
            }
          ],
          "hints": [
            "splitlines reconoce diferentes finales de línea.",
            "Filtra después de quitar espacios."
          ]
        },
        {
          "id": "text-roundtrip",
          "title": "Guarda texto UTF-8",
          "prompt": "Implementa guardar_y_leer(ruta,texto): escribe el texto en UTF-8 y devuelve el contenido que vuelve a leer.",
          "starter": "def guardar_y_leer(ruta, texto):\n    pass\n",
          "tests": [
            {
              "check": "import tempfile, pathlib\nwith tempfile.TemporaryDirectory() as d:\n    assert guardar_y_leer(str(pathlib.Path(d)/\"dato.txt\"),\"José\\nAna\")==\"José\\nAna\"",
              "feedback": "Usa UTF-8 tanto al escribir como al leer."
            },
            {
              "check": "import tempfile, pathlib\nwith tempfile.TemporaryDirectory() as d:\n    assert guardar_y_leer(str(pathlib.Path(d)/\"vacio.txt\"),\"\")==\"\"",
              "feedback": "Un texto vacío también debe conservarse."
            }
          ],
          "hints": [
            "Usa dos bloques with.",
            "Devuelve lo leído, no solo el argumento original."
          ]
        }
      ],
      "pitfall": "Una ruta como C:\\Usuarios\\Ana solo sirve en ese equipo; construye rutas relativas al proyecto."
    },
    {
      "id": "json",
      "title": "JSON y datos estructurados",
      "module": 4,
      "minutes": 20,
      "source": "https://github.com/freeCodeCamp/freeCodeCamp/tree/main/curriculum/challenges/english/blocks/error-handling-files-and-modules-in-python",
      "explanation": [
        "JSON representa objetos, listas, texto, números, booleanos y null. json.loads() convierte texto JSON en objetos Python; json.dumps() hace la conversión inversa.",
        "Un JSON válido todavía puede tener una estructura incorrecta para tu aplicación. Comprueba el tipo principal y las claves necesarias antes de utilizarlo. No uses eval() para leer datos."
      ],
      "keyPoints": [
        "loads recibe texto; load recibe un archivo.",
        "JSON usa comillas dobles en textos y claves.",
        "Valida la estructura después de analizar."
      ],
      "examples": [
        {
          "title": "Del texto al diccionario",
          "code": "import json\ndatos = json.loads('{\"nombre\":\"Ana\",\"edad\":18}')\nprint(datos[\"edad\"] + 1)",
          "output": "19",
          "explanation": "Después de loads, edad es un número Python."
        },
        {
          "title": "Conservar acentos",
          "code": "import json\ntexto = json.dumps({\"nombre\":\"José\"},ensure_ascii=False)\nprint(texto)",
          "output": "{\"nombre\": \"José\"}",
          "explanation": "ensure_ascii=False mantiene los caracteres legibles en el texto generado."
        }
      ],
      "quiz": [
        {
          "prompt": "¿Qué función analiza texto JSON?",
          "choices": [
            "eval",
            "json.loads",
            "json.dumps",
            "print"
          ],
          "answer": 1,
          "explanation": "loads transforma una cadena JSON en objetos Python."
        },
        {
          "prompt": "Un JSON válido garantiza…",
          "choices": [
            "Que tenga las claves necesarias",
            "Solo que la sintaxis JSON sea válida",
            "Que sea seguro ejecutarlo",
            "Que sea una lista"
          ],
          "answer": 1,
          "explanation": "Todavía debes verificar su estructura para tu caso de uso."
        },
        {
          "prompt": "null de JSON se convierte a…",
          "choices": [
            "False",
            "0",
            "None",
            "\"null\""
          ],
          "answer": 2,
          "explanation": "None representa ausencia de valor en Python."
        }
      ],
      "exercises": [
        {
          "id": "load-record",
          "title": "Carga un registro",
          "prompt": "Crea cargar_nombre(texto): analiza JSON y devuelve el valor de nombre, o \"Sin nombre\" si falta. El texto será un objeto JSON válido.",
          "starter": "def cargar_nombre(texto):\n    pass\n",
          "tests": [
            {
              "check": "assert cargar_nombre('{\"nombre\":\"Ana\"}')==\"Ana\"",
              "feedback": "Analiza y consulta la clave nombre."
            },
            {
              "check": "assert cargar_nombre(\"{}\")==\"Sin nombre\"",
              "feedback": "Usa el valor alternativo acordado."
            },
            {
              "check": "assert cargar_nombre('{\"nombre\":\"José\"}')==\"José\"",
              "feedback": "No pierdas caracteres acentuados."
            }
          ],
          "hints": [
            "Importa json.",
            "get permite especificar una alternativa."
          ]
        },
        {
          "id": "valid-json-list",
          "title": "Valida una lista JSON",
          "prompt": "Crea leer_lista(texto): devuelve la lista si el JSON es válido y su raíz es una lista; en otro caso devuelve None.",
          "starter": "def leer_lista(texto):\n    pass\n",
          "tests": [
            {
              "check": "assert leer_lista(\"[1,2]\")==[1,2]",
              "feedback": "Una lista JSON válida se conserva."
            },
            {
              "check": "assert leer_lista(\"[]\")==[]",
              "feedback": "La lista vacía es válida."
            },
            {
              "check": "assert leer_lista(\"{}\") is None",
              "feedback": "Un objeto válido no es una lista."
            },
            {
              "check": "assert leer_lista(\"esto no es JSON\") is None",
              "feedback": "Captura JSONDecodeError."
            }
          ],
          "hints": [
            "Distingue análisis de validación de tipo.",
            "Comprueba isinstance(dato, list)."
          ]
        }
      ],
      "pitfall": "eval ejecuta código: no es un analizador de JSON ni debe usarse para leer una entrega."
    },
    {
      "id": "classes",
      "title": "Clases y objetos",
      "module": 4,
      "minutes": 20,
      "source": "https://github.com/freeCodeCamp/freeCodeCamp/tree/main/curriculum/challenges/english/blocks/core-primitives-in-python",
      "explanation": [
        "Una clase define datos y comportamiento de una familia de objetos. __init__ prepara cada instancia; self representa la instancia que recibe el método.",
        "Los atributos de instancia pertenecen a cada objeto. Un atributo mutable de clase puede compartirse entre todas las instancias: úsalo solo si ese comportamiento es intencional."
      ],
      "keyPoints": [
        "self da acceso al estado del objeto.",
        "__init__ prepara una instancia.",
        "Cada objeto debe mantener su propio estado cuando corresponda."
      ],
      "examples": [
        {
          "title": "Un contador independiente",
          "code": "class Contador:\n    def __init__(self):\n        self.valor = 0\n    def subir(self):\n        self.valor += 1\na = Contador()\nb = Contador()\na.subir()\nprint(a.valor, b.valor)",
          "output": "1 0",
          "explanation": "Cambiar a no cambia b: valor es un atributo de instancia."
        },
        {
          "title": "Una representación útil",
          "code": "class Punto:\n    def __init__(self,x,y):\n        self.x=x\n        self.y=y\n    def distancia_origen(self):\n        return (self.x**2+self.y**2)**0.5\nprint(Punto(3,4).distancia_origen())",
          "output": "5.0",
          "explanation": "El método usa los datos de su propia instancia."
        }
      ],
      "quiz": [
        {
          "prompt": "¿Qué representa self?",
          "choices": [
            "La clase entera siempre",
            "La instancia actual",
            "Un número",
            "Un archivo"
          ],
          "answer": 1,
          "explanation": "Permite leer y modificar el estado de ese objeto."
        },
        {
          "prompt": "¿Cuándo se usa __init__?",
          "choices": [
            "Al preparar una nueva instancia",
            "Cada segundo",
            "Al cerrar Python",
            "Solo en errores"
          ],
          "answer": 0,
          "explanation": "Inicializa los datos del objeto recién creado."
        },
        {
          "prompt": "Para listas independientes conviene crearlas…",
          "choices": [
            "Como atributo de clase siempre",
            "Dentro de __init__ con self.lista",
            "En una global",
            "Con el mismo nombre global"
          ],
          "answer": 1,
          "explanation": "Cada instancia recibe su propia lista."
        }
      ],
      "exercises": [
        {
          "id": "counter-class",
          "title": "Un contador con estado",
          "prompt": "Implementa Contador: empieza con valor=0; incrementar() suma uno y devuelve el nuevo valor.",
          "starter": "class Contador:\n    def __init__(self):\n        pass\n\n    def incrementar(self):\n        pass\n",
          "tests": [
            {
              "check": "a=Contador(); assert a.valor==0",
              "feedback": "Inicializa valor en cero."
            },
            {
              "check": "a=Contador(); assert a.incrementar()==1 and a.incrementar()==2",
              "feedback": "Cada llamada avanza y devuelve el nuevo valor."
            },
            {
              "check": "a=Contador(); b=Contador(); a.incrementar(); assert b.valor==0",
              "feedback": "Las instancias deben ser independientes."
            }
          ],
          "hints": [
            "Inicializa self.valor en __init__.",
            "Devuelve el estado después de incrementarlo."
          ]
        },
        {
          "id": "task-list-class",
          "title": "Lista de pendientes",
          "prompt": "Implementa Agenda: tiene tareas inicialmente vacía; agregar(texto) agrega a esa instancia; pendientes() devuelve una copia de sus tareas.",
          "starter": "class Agenda:\n    def __init__(self):\n        pass\n\n    def agregar(self, texto):\n        pass\n\n    def pendientes(self):\n        pass\n",
          "tests": [
            {
              "check": "a=Agenda(); a.agregar(\"Estudiar\"); assert a.pendientes()==[\"Estudiar\"]",
              "feedback": "Agrega y consulta una tarea."
            },
            {
              "check": "a=Agenda(); b=Agenda(); a.agregar(\"X\"); assert b.pendientes()==[]",
              "feedback": "No compartas tareas entre instancias."
            },
            {
              "check": "a=Agenda(); copia=a.pendientes(); copia.append(\"X\"); assert a.pendientes()==[]",
              "feedback": "Devuelve una copia para proteger el estado interno."
            }
          ],
          "hints": [
            "Crea self.tareas dentro de __init__.",
            "Usa copy() al devolver pendientes."
          ]
        }
      ],
      "pitfall": "No omitas self en la definición de un método de instancia."
    },
    {
      "id": "project",
      "title": "Proyecto: presupuesto personal",
      "module": 4,
      "minutes": 20,
      "source": "https://github.com/freeCodeCamp/freeCodeCamp/tree/main/curriculum/challenges/english/blocks/build-a-budget-app-project",
      "explanation": [
        "Un proyecto combina varios contratos pequeños. Antes de programar, define entradas, salidas y casos inválidos. Separa cálculo, presentación y persistencia para poder probar cada parte.",
        "Un saldo suma ingresos y resta gastos. Una categoría permite agrupar movimientos. Prueba listas vacías, gastos mayores a ingresos y tipos desconocidos; muestra los límites del resultado en vez de dar una certeza falsa."
      ],
      "keyPoints": [
        "Divide el proyecto en funciones verificables.",
        "No cambies los movimientos al consultarlos.",
        "Prueba también saldos negativos y datos vacíos."
      ],
      "examples": [
        {
          "title": "Acumular por tipo",
          "code": "movimientos=[(\"ingreso\",100),(\"gasto\",30)]\nsaldo=0\nfor tipo,monto in movimientos:\n    saldo += monto if tipo==\"ingreso\" else -monto\nprint(saldo)",
          "output": "70",
          "explanation": "El signo depende del tipo de movimiento."
        },
        {
          "title": "Agrupar por categoría",
          "code": "gastos=[(\"comida\",20),(\"viaje\",10),(\"comida\",5)]\npor_categoria={}\nfor categoria,monto in gastos:\n    por_categoria[categoria]=por_categoria.get(categoria,0)+monto\nprint(por_categoria[\"comida\"])",
          "output": "25",
          "explanation": "El patrón de conteo se adapta a una acumulación monetaria."
        }
      ],
      "quiz": [
        {
          "prompt": "¿Qué función es más fácil de probar?",
          "choices": [
            "Una que lee teclado, calcula y abre ventanas",
            "Una que recibe movimientos y devuelve el saldo",
            "Una que depende de variables ocultas",
            "Una que solo imprime sin contrato"
          ],
          "answer": 1,
          "explanation": "Las entradas y salidas explícitas permiten casos repetibles."
        },
        {
          "prompt": "Un saldo negativo significa…",
          "choices": [
            "Error siempre",
            "Que los gastos superaron los ingresos",
            "Que falta un import",
            "Que se debe convertir a cero"
          ],
          "answer": 1,
          "explanation": "Puede ser una salida válida según el problema."
        },
        {
          "prompt": "Antes de añadir una gráfica conviene…",
          "choices": [
            "Ocultar errores",
            "Probar el cálculo base",
            "Cambiar los resultados a texto",
            "Eliminar los casos vacíos"
          ],
          "answer": 1,
          "explanation": "La presentación debe apoyarse en un cálculo comprobado."
        }
      ],
      "exercises": [
        {
          "id": "budget-balance",
          "title": "Saldo de movimientos",
          "prompt": "Crea saldo(movimientos). Suma ingreso, resta gasto e ignora tipos desconocidos. Cada movimiento contiene tipo y monto. Redondea a dos decimales.",
          "starter": "def saldo(movimientos):\n    pass\n",
          "tests": [
            {
              "check": "assert saldo([{\"tipo\":\"ingreso\",\"monto\":100},{\"tipo\":\"gasto\",\"monto\":30}])==70",
              "feedback": "Suma ingresos y resta gastos."
            },
            {
              "check": "assert saldo([])==0",
              "feedback": "Un presupuesto vacío empieza en cero."
            },
            {
              "check": "assert saldo([{\"tipo\":\"gasto\",\"monto\":10}])==-10",
              "feedback": "El saldo puede ser negativo."
            },
            {
              "check": "assert saldo([{\"tipo\":\"otro\",\"monto\":99}])==0",
              "feedback": "Ignora tipos desconocidos."
            }
          ],
          "hints": [
            "Usa un acumulador por cada movimiento.",
            "Decide el signo con if/elif."
          ]
        },
        {
          "id": "budget-summary",
          "title": "Resumen de gastos",
          "prompt": "Crea gastos_por_categoria(movimientos): suma solo los movimientos tipo gasto por categoria. Devuelve un diccionario, con montos redondeados a dos decimales.",
          "starter": "def gastos_por_categoria(movimientos):\n    pass\n",
          "tests": [
            {
              "check": "assert gastos_por_categoria([])=={}",
              "feedback": "Un listado vacío produce un diccionario vacío."
            },
            {
              "check": "assert gastos_por_categoria([{\"tipo\":\"gasto\",\"monto\":20,\"categoria\":\"comida\"},{\"tipo\":\"gasto\",\"monto\":5,\"categoria\":\"comida\"}])=={\"comida\":25}",
              "feedback": "Agrupa gastos de una misma categoría."
            },
            {
              "check": "assert gastos_por_categoria([{\"tipo\":\"ingreso\",\"monto\":100,\"categoria\":\"sueldo\"}])=={}",
              "feedback": "No cuentes ingresos como gastos."
            },
            {
              "check": "assert gastos_por_categoria([{\"tipo\":\"gasto\",\"monto\":0.1,\"categoria\":\"x\"},{\"tipo\":\"gasto\",\"monto\":0.2,\"categoria\":\"x\"}])=={\"x\":0.3}",
              "feedback": "Redondea el resultado final de cada categoría."
            }
          ],
          "hints": [
            "Filtra por tipo antes de acumular.",
            "get(categoria, 0) proporciona un punto de partida."
          ]
        }
      ],
      "pitfall": "No uses una calificación de pruebas locales como certificación de autoría o revisión institucional."
    }
  ],
  "assessments": [
    {
      "id": "checkpoint-basics",
      "title": "Evaluación 1 · Fundamentos",
      "modules": [
        0
      ],
      "exercise": {
        "id": "checkpoint-basics",
        "title": "Evaluación 1 · Fundamentos",
        "prompt": "Define convertir_minutos(segundos), que devuelve (minutos, resto), y limpiar_nombre(texto), que devuelve texto sin espacios externos y con iniciales mayúsculas.",
        "starter": "def convertir_minutos(segundos):\n    pass\n\ndef limpiar_nombre(texto):\n    pass\n",
        "tests": [
          {
            "check": "assert convertir_minutos(125)==(2,5)",
            "feedback": "Convierte 125 segundos correctamente."
          },
          {
            "check": "assert convertir_minutos(0)==(0,0)",
            "feedback": "Contempla cero segundos."
          },
          {
            "check": "assert convertir_minutos(60)==(1,0)",
            "feedback": "Incluye el minuto exacto."
          },
          {
            "check": "assert limpiar_nombre(\"  ana torres  \")==\"Ana Torres\"",
            "feedback": "Limpia y normaliza el nombre."
          },
          {
            "check": "assert limpiar_nombre(\"\")==\"\"",
            "feedback": "Conserva el texto vacío."
          }
        ],
        "hints": [
          "Divide el problema en funciones pequeñas.",
          "Comprueba límites, listas vacías y conservación de los datos."
        ]
      },
      "questionIds": [
        "first-program:0",
        "variables:0",
        "numbers:0",
        "strings:0",
        "first-program:1",
        "variables:1",
        "numbers:1",
        "strings:1",
        "first-program:2",
        "variables:2",
        "numbers:2",
        "strings:2"
      ]
    },
    {
      "id": "checkpoint-control",
      "title": "Evaluación 2 · Decisiones y bucles",
      "modules": [
        1
      ],
      "exercise": {
        "id": "checkpoint-control",
        "title": "Evaluación 2 · Decisiones y bucles",
        "prompt": "Define contar_pares(datos), que cuenta enteros pares, y clasificar(nota): excelente desde 90, aprobado desde 60 y repasar en otro caso.",
        "starter": "def contar_pares(datos):\n    pass\n\ndef clasificar(nota):\n    pass\n",
        "tests": [
          {
            "check": "assert contar_pares([1,2,3,4])==2",
            "feedback": "Cuenta solo los pares."
          },
          {
            "check": "assert contar_pares([])==0",
            "feedback": "Contempla una lista vacía."
          },
          {
            "check": "assert contar_pares([-2,0,3])==2",
            "feedback": "Cero y los pares negativos también cuentan."
          },
          {
            "check": "assert clasificar(90)==\"excelente\"",
            "feedback": "Incluye exactamente 90."
          },
          {
            "check": "assert clasificar(60)==\"aprobado\" and clasificar(89)==\"aprobado\"",
            "feedback": "Incluye el intervalo de aprobación."
          },
          {
            "check": "assert clasificar(59)==\"repasar\"",
            "feedback": "Revisa una nota por debajo del límite."
          }
        ],
        "hints": [
          "Divide el problema en funciones pequeñas.",
          "Comprueba límites, listas vacías y conservación de los datos."
        ]
      },
      "questionIds": [
        "booleans:0",
        "conditions:0",
        "for-loops:0",
        "while-loops:0",
        "booleans:1",
        "conditions:1",
        "for-loops:1",
        "while-loops:1",
        "booleans:2",
        "conditions:2",
        "for-loops:2",
        "while-loops:2"
      ]
    },
    {
      "id": "checkpoint-collections",
      "title": "Evaluación 3 · Colecciones y funciones",
      "modules": [
        2,
        3
      ],
      "exercise": {
        "id": "checkpoint-collections",
        "title": "Evaluación 3 · Colecciones y funciones",
        "prompt": "Define resumen(datos): para una lista de números devuelve un diccionario con cantidad, suma y promedio (0 si está vacía). Define frecuencias(texto): cuenta palabras ignorando mayúsculas.",
        "starter": "def resumen(datos):\n    pass\n\ndef frecuencias(texto):\n    pass\n",
        "tests": [
          {
            "check": "assert resumen([2,4,6])=={\"cantidad\":3,\"suma\":12,\"promedio\":4}",
            "feedback": "Comprueba todos los campos del resumen."
          },
          {
            "check": "assert resumen([])=={\"cantidad\":0,\"suma\":0,\"promedio\":0}",
            "feedback": "No dividas entre cero."
          },
          {
            "check": "datos=[-2,2]; resumen(datos); assert datos==[-2,2]",
            "feedback": "No modifiques la entrada."
          },
          {
            "check": "assert frecuencias(\"Hola hola SOL\")=={\"hola\":2,\"sol\":1}",
            "feedback": "Normaliza antes de contar."
          },
          {
            "check": "assert frecuencias(\" \")=={}",
            "feedback": "Un texto vacío produce un diccionario vacío."
          }
        ],
        "hints": [
          "Divide el problema en funciones pequeñas.",
          "Comprueba límites, listas vacías y conservación de los datos."
        ]
      },
      "questionIds": [
        "lists:0",
        "sets-tuples:0",
        "dictionaries:0",
        "comprehensions:0",
        "functions:0",
        "scope:0",
        "exceptions:0",
        "testing:0",
        "lists:1",
        "sets-tuples:1",
        "dictionaries:1",
        "comprehensions:1"
      ]
    },
    {
      "id": "checkpoint-final",
      "title": "Evaluación final · Proyecto y datos",
      "modules": [
        4
      ],
      "exercise": {
        "id": "checkpoint-final",
        "title": "Evaluación final · Proyecto y datos",
        "prompt": "Implementa analizar(texto_json). La raíz JSON debe ser una lista de números. Devuelve cantidad y suma; si el texto es inválido, no es lista o contiene un elemento no numérico, devuelve None. No aceptes booleanos como números.",
        "starter": "def analizar(texto_json):\n    pass\n",
        "tests": [
          {
            "check": "assert analizar(\"[1,2,3]\")=={\"cantidad\":3,\"suma\":6}",
            "feedback": "Analiza y resume una lista válida."
          },
          {
            "check": "assert analizar(\"[]\")=={\"cantidad\":0,\"suma\":0}",
            "feedback": "La lista vacía es válida."
          },
          {
            "check": "assert analizar(\"[-2,0,2.5]\")=={\"cantidad\":3,\"suma\":0.5}",
            "feedback": "Admite negativos y decimales."
          },
          {
            "check": "assert analizar(\"{}\") is None",
            "feedback": "Rechaza objetos JSON."
          },
          {
            "check": "assert analizar(\"no json\") is None",
            "feedback": "Rechaza sintaxis inválida."
          },
          {
            "check": "assert analizar('[1,\"dos\"]') is None",
            "feedback": "Valida cada elemento."
          },
          {
            "check": "assert analizar(\"[true,1]\") is None",
            "feedback": "Un booleano no es un dato numérico admitido en este contrato."
          }
        ],
        "hints": [
          "Divide el problema en funciones pequeñas.",
          "Comprueba límites, listas vacías y conservación de los datos."
        ]
      },
      "questionIds": [
        "files:0",
        "json:0",
        "classes:0",
        "project:0",
        "files:1",
        "json:1",
        "classes:1",
        "project:1",
        "files:2",
        "json:2",
        "classes:2",
        "project:2"
      ]
    }
  ]
};
if (typeof module !== "undefined" && module.exports) module.exports = content; else root.CodeGOCourseContent = content;
})(globalThis);
