# Monitor WhatsApp

Página web estática para monitorear WhatsApp común y WhatsApp Business con fuentes gratuitas.

## Qué hace

- GitHub Actions chequea cada 10 minutos aunque la página esté cerrada.
- El chequeo actualiza estos archivos:
  - `data/status.json`
  - `data/incidents.json`
- La página publicada en GitHub Pages lee esos JSON y muestra:
  - Indicadores verdes si está normal.
  - Indicadores rojos si hay caída activa.
  - Fecha, hora, problema, fuente y duración total.
- También permite exportar/importar JSON desde la interfaz.

## Fuentes gratuitas usadas

- Google Noticias RSS con búsquedas de caída de WhatsApp.
- Google Noticias RSS con búsquedas de WhatsApp Business.
- Chequeo liviano del sitio público de WhatsApp.
- Enlaces manuales a X.com, Downdetector, Google, Google Noticias y Meta Status.

Para evitar bloqueos, la automatización no scrapea X.com ni Downdetector. Esas fuentes quedan como verificación manual desde la pantalla.

## Cómo subirlo a GitHub

1. Creá un repositorio nuevo en GitHub.
2. Subí todo el contenido de esta carpeta al repositorio.
3. Verificá que existan estas rutas:
   - `index.html`
   - `data/status.json`
   - `data/incidents.json`
   - `scripts/check-status.js`
   - `.github/workflows/check-whatsapp.yml`

## Activar permisos para que el JSON se actualice

1. Entrá al repositorio en GitHub.
2. Andá a `Settings`.
3. Entrá a `Actions > General`.
4. En `Workflow permissions`, elegí `Read and write permissions`.
5. Guardá.

Esto permite que GitHub Actions escriba los JSON actualizados en el repositorio.

## Activar GitHub Pages

1. Entrá a `Settings > Pages`.
2. En `Build and deployment`, elegí:
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/root`
3. Guardá.
4. GitHub te va a mostrar la URL pública de la página.

## Ejecutar el primer chequeo

1. Entrá a la pestaña `Actions`.
2. Abrí el workflow `Chequear WhatsApp`.
3. Tocá `Run workflow`.
4. Esperá a que termine.
5. Volvé a la página publicada y tocá `Actualizar ahora`.

Después de eso, GitHub lo ejecuta automáticamente cada 10 minutos.

## Cambiar la frecuencia

Editá `.github/workflows/check-whatsapp.yml`.

Actual:

```yaml
- cron: "*/10 * * * *"
```

Cada 5 minutos:

```yaml
- cron: "*/5 * * * *"
```

Recomendado: 10 minutos. Es más estable para fuentes gratuitas.
