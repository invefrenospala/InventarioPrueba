# Inventario — Frenos Pala

Aplicación de inventario con tus 164 referencias reales y las 5 bodegas.

---

## PONERLA EN EL CELULAR

**La cámara solo funciona en páginas https.** Por eso hay que publicarla; no
sirve abrir el archivo directamente.

1. Descomprime el zip
2. Entra a **https://app.netlify.com/drop** (crea la cuenta gratis si te la pide)
3. Arrastra **la carpeta completa** al recuadro
4. Te da una dirección tipo `https://algo-123.netlify.app`
5. Ábrela en el celular → tres puntos → **Añadir a pantalla de inicio**

Si la cámara falla, **la app te dice exactamente por qué** y qué hacer.
Ya no se queda callada.

---

## LO QUE TRAE

**164 referencias reales**, salidas de tu archivo de Bodega 5. Ya limpié:
- Tres códigos repetidos (`FP-AMMZ7`, `K1971-CR`, `K1275-CR`) quedaron en uno
- `k1968-CR` quedó en mayúscula como los demás
- Las categorías con espacios de más quedaron parejas

**Las 5 bodegas.** Bodega 5 con las cantidades de tu archivo; las otras cuatro
salen como "sin contar" hasta que las cuenten. No inventé números.

**Tus referencias tal como son.** `K1968-CR` sigue siendo `K1968-CR`. El
sistema se adapta a tus códigos, no al revés.

---

## CÓMO FUNCIONA EL ESCANEO

No hacía falta cambiar ninguna etiqueta. Funciona así:

1. Escaneas un producto
2. Si el código de barras ya está asociado, abre la ficha de una
3. Si el código **es** la referencia (o la contiene), la reconoce sola
4. Si es un código nuevo, te pregunta **"¿qué producto es?"**, lo eliges de la
   lista, y queda ligado para siempre

Así el catálogo se va codificando solo con el uso diario. En unas semanas los
productos que más rotan ya se escanean sin preguntar nada, que son justamente
los que importan.

**Los códigos asociados se guardan en el celular.** Descarga una copia de vez
en cuando desde Informes → Copia de seguridad.

---

## QUÉ PUEDES HACER

- **Entrada** — llega mercancía a la bodega en la que estás
- **Salida** — sale mercancía de esa bodega
- **Traslado** — mueve unidades de una bodega a otra
- **Conteo** — fija cuántas hay de verdad, para el inventario físico

Arriba a la derecha eliges **en qué bodega estás trabajando**. Está siempre
visible para que nadie registre en la equivocada.

Cada movimiento queda registrado con fecha, bodega y cantidad.

---

## LOS INFORMES ARRANCAN VACÍOS

Y tiene que ser así. El sistema no sabe todavía cuánto se vende de cada
producto, porque nunca se ha registrado. Después de unas semanas de uso
aparecen solos:

- Cuáles productos son los que más salen
- Cuánto conviene comprar de cada uno, y por qué
- Existencias por bodega

Lo que **sí funciona desde el primer día**: el valor del inventario, las
existencias, los agotados, y saber en qué bodega está cada cosa.

---

## DOS COSAS QUE VALE LA PENA QUE SEPAS

**Los precios de tu archivo son de venta, no de costo.** Lo confirmé: los 43
precios distintos dan cifra redonda al sumarles el IVA (por ejemplo
$151.260,50 + 19% = $180.000 exacto). Por eso el sistema no puede calcular
utilidad. Si tu jefe la quiere, hay que conseguir los costos de compra.

**Once referencias venían sin unidades** en el archivo. Salen como "sin
contar", no como agotadas. No es lo mismo *no hay* que *no sabemos cuántas
hay*, y mezclarlas daría informes falsos.

---

## LO QUE FALTA PARA QUE SEA UN SISTEMA DE VERDAD

Ahora mismo los datos viven en cada celular. Eso significa que si dos personas
usan la app, cada una ve sus propios números.

Para que funcione con las 2-3 personas que registran salidas, hay que
conectarlo a una base de datos, igual que hicimos con el sistema de turnos.
Eso es el proyecto real; esto de aquí ya es funcional y sirve para probarlo
en el taller y mostrárselo a tu jefe.
