---
outputPath: "es/collect/index"
title: "Sky Sounds - COLLECT.MAAR.WORLD"
area: "collect"
kind: "index"
tags: []
lang: "es"
origin: "authored"
translationOf: "collect/index"
family: "collect"
description: "Explorá una dimensión musical nueva con Sky Sounds, una colección de cartas que abren las puertas a un viaje sonoro por el cosmos."
headingHtml: "<span class=\"mark mark--cut mark--tilt-4 mark--tear-2\">Collect</span>"
collect:
  pitch:
    title: "Crea música con cartas y exoplanetas"
    mark: "exoplanetas"
    body: "Sky Sounds es la primera colección de cartas que, al escanearlas, te deja escuchar su música y transformarla según el movimiento de los exoplanetas a los que pertenece."
    cta: "Coleccionar"
  orbiters:
    label: "¿Qué es un orbitador?"
  journey:
    title: "Empezá tu viaje"
    mark: "viaje"
    carouselLabel: "5 fotografías"
    slides:
      - step: "I"
        caption: "Elegí una carta Sky Sounds que te resuene y te den ganas de explorar sus paisajes sonoros."
      - step: "II"
        caption: "En las ediciones físicas, escaneá la carta con el celular o con un lector NFC en la computadora para acceder a su contenido. En las cartas digitales, descubrí parámetros escondidos."
      - step: "III"
        caption: "Reproducí la música de la carta y metete en su universo sonoro."
      - step: "IV"
        caption: "Sumá más cartas a tu composición. Podés incluir tantas como tu dispositivo aguante, y así enriquecer y personalizar todavía más tu experiencia musical."
      - step: "V"
        caption: "Transformá la música con los efectos y los loops que trae la carta, y armá tu propia versión o tu propia pieza."
---

<!--
  La traducción de src/content/pages/en/collect/index.md.

  ESTE CUERPO ESTÁ VACÍO A PROPÓSITO — MW-19.

  Antes tenía ~45 elementos de HTML: la grilla, las bandas, la fachada de
  YouTube, los botones y el carrusel de cinco pasos. Todo eso era una COPIA de
  la estructura de la mitad en inglés, porque traducir esta página significaba
  copiarla entera y traducir las palabras de adentro. Dos copias de una sola
  estructura, sostenidas a mano, y ya se habían separado en dos elementos: esta
  página se veía distinta de la inglesa, y así fue como se descubrió.

  La estructura vive una sola vez, en src/components/families/Collect.astro.
  Acá quedan las palabras de esta página, en el campo `collect` de arriba. Un
  cambio de diseño es una edición en el componente; una traducción son palabras.

  EL INGLÉS ES LA FUENTE DE VERDAD PARA LA ESTRUCTURA — decisión de la dueña,
  2026-08-01. Este registro no lleva marcado estructural en el cuerpo, y esa es
  la regla que la suite va a exigir. No es que el español sea contenido de
  segunda: las dos mitades se dibujan con el mismo componente, así que se ven
  igual. Decide dónde se AUTORA la estructura, no cómo se SIRVE.

  TRES COSAS QUE ANTES ESTABAN ACÁ Y AHORA SON REGLA, NO NOTA:

  (1) Los id del carrusel llevaban prefijo "es-" a mano para no chocar con los
      de la mitad en inglés. Ahora se derivan del `outputPath` del registro en
      [...page].astro, así que "es/collect/index" da
      "carousel-es-collect-index-1" solo. Dos mitades de un par no pueden
      chocar porque sus outputPath no pueden.

  (2) El botón "¿Qué es un orbitador?" apuntaba a /es/orbiters escrito a mano,
      con una nota explicando que mandar a alguien que lee en español a la
      página en inglés sería perder el idioma en un clic. Eso es una regla, no
      una excepción de esta página: la ruta la resuelve con `navPathsFor`, la
      misma que usa la navegación y que `verify:translations` ya exige.

  (3) Los path de las imágenes eran idénticos a los de la mitad en inglés. Por
      eso ya no están acá: una fotografía es la misma fotografía en español, y
      escribirla dos veces es el mismo defecto que este issue vino a sacar.
      Están una sola vez, en COLLECT_JOURNEY_IMAGES.

  Y UNA QUE SE CORRIGE: el cuerpo repetía el `description` como párrafo debajo
  del h1. La familia ya se lo pasa al collage, así que esta página imprimía su
  frase de apertura dos veces. La mitad en inglés no lo hacía. Gana el inglés.
-->
