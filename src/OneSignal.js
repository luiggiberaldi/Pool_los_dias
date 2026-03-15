import OneSignal from 'react-onesignal';

export default async function runOneSignal() {


  try {
    await OneSignal.init({
      appId: "c3c60e6d-0479-489a-9f05-f6bdf915c166",
      allowLocalhostAsSecureOrigin: true,
      language: 'es', // Forzar español
      notifyButton: {
        enable: true,
        // Textos cortos y específicos para BCV
        text: {
          'tip.state.unsubscribed': 'Activar alertas BCV',
          'tip.state.subscribed': 'Alertas BCV activas',
          'tip.state.blocked': 'Notificaciones bloqueadas',
          'message.prenotify': 'Toca para recibir alertas del BCV',
          'message.action.subscribed': '¡Listo! Te avisaremos cuando cambie el BCV.',
          'message.action.resubscribed': 'Alertas BCV activadas',
          'message.action.unsubscribed': 'Alertas desactivadas',
          'dialog.main.title': 'Alertas BCV',
          'dialog.main.button.subscribe': 'ACTIVAR',
          'dialog.main.button.unsubscribe': 'DESACTIVAR',
          'dialog.blocked.title': 'Desbloquear Alertas',
          'dialog.blocked.message': 'Sigue las instrucciones para permitir las alertas del BCV:'
        }
      },
      welcomeNotification: {
        disable: false,
        title: 'Precios al Día',
        message: '¡Alertas BCV activadas!',
      },
      serviceWorkerPath: 'OneSignalSDKWorker.js',
      serviceWorkerParam: { scope: '/' }
    });
    // OneSignal inicializado correctamente
  } catch (err) {

    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isLocalhost) {
      console.warn("⚠️ OneSignal deshabilitado en local (Restricción de dominio)");
    } else {
      console.error("❌ Error al iniciar OneSignal", err);
    }
  }
}
