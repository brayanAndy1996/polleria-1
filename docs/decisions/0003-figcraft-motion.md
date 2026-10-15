# ADR 0003 — Motion y Nunito local para el rediseño FigCraft

Fecha: 2026-10-15. Estado: aceptado por solicitud explícita del usuario de usar Motion y seguir el diseño/colorimetría FigCraft.

La interfaz en dev se adapta a los frames de polleria, usando Nunito servida localmente y Motion for React. Instalar versiones exactas, registrar en apps/web/package.json y pnpm-lock.yaml. No se sustituyen HeroUI, Next ni las capas existentes.

MotionConfig reducedMotion=user y useReducedMotion para interacciones que requieran eliminar desplazamiento. Animaciones breves de transform/opacity responden a acciones; polling no debe volver a montar formularios ni reiniciar animaciones. Sin bucles decorativos ni dependencias de red en ejecución. Nunito se distribuye con su licencia a través de @fontsource-variable/nunito.

Referencia oficial: https://motion.dev/docs/react. Las fotografías son las originales locales usadas en FigCraft y exclusivas de demo, sin implicar stock ni foto real del producto del local.
