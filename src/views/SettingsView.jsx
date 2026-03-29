import React, { useState, useRef } from 'react';
import {
    ArrowLeft, Store, Printer, Coins, Package, CreditCard, Database,
    Palette, Fingerprint, Upload, Download, Share2, Check, X,
    AlertTriangle, Copy, Sun, Moon, ChevronRight, Trash2, Users, FileText, Lock,
    Mail, Eye, EyeOff, CheckCircle2, ShieldCheck
} from 'lucide-react';
import { storageService } from '../utils/storageService';
import localforage from 'localforage';
import { showToast } from '../components/Toast';
import PaymentMethodsManager from '../components/Settings/PaymentMethodsManager';
import UsersManager from '../components/Settings/UsersManager';
import AuditLogViewer from '../components/Settings/AuditLogViewer';
import { useSecurity } from '../hooks/useSecurity';
import { generateDailyClosePDF } from '../utils/dailyCloseGenerator';
import { useNotifications } from '../hooks/useNotifications';
import { supabaseCloud } from '../config/supabaseCloud';
import AnimatedCounter from '../components/AnimatedCounter';
import { useProductContext } from '../context/ProductContext';
import { useAuthStore } from '../hooks/store/useAuthStore';
import ShareInventoryModal from '../components/ShareInventoryModal';
import { useAudit } from '../hooks/useAudit';

// ───────────────────────────────────────────────────── Toggle
function Toggle({ enabled, onChange, color = 'emerald' }) {
    const colors = {
        emerald: enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600',
        amber: enabled ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-600',
        indigo: enabled ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-600',
        rose: enabled ? 'bg-rose-500' : 'bg-slate-300 dark:bg-slate-600',
    };
    return (
        <button
            onClick={onChange}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${colors[color]}`}
        >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
    );
}

// ───────────────────────────────────────────────────── Section Card
function SectionCard({ icon: Icon, title, subtitle, iconColor = 'text-slate-500', children }) {
    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-50 dark:border-slate-800/50 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center ${iconColor}`}>
                    <Icon size={18} />
                </div>
                <div>
                    <h3 className="text-sm font-black text-slate-800 dark:text-white">{title}</h3>
                    {subtitle && <p className="text-[10px] text-slate-400 mt-0.5">{subtitle}</p>}
                </div>
            </div>
            <div className="p-5 space-y-4">{children}</div>
        </div>
    );
}

// ───────────────────────────────────────────────────── Tab Config
const TABS = [
    { id: 'negocio', label: 'Negocio', icon: Store },
    { id: 'ventas', label: 'Ventas', icon: CreditCard },
    { id: 'usuarios', label: 'Usuarios', icon: Users, adminOnly: true },
    { id: 'sistema', label: 'Sistema', icon: Database },
];

// ═══════════════════════════════════════════════════════ MAIN
export default function SettingsView({ onClose, theme, toggleTheme, triggerHaptic }) {
    const {
        products, categories, setProducts, setCategories,
        copEnabled, setCopEnabled,
        autoCopEnabled, setAutoCopEnabled,
        tasaCopManual, setTasaCopManual,
        tasaCop: calculatedTasaCop
    } = useProductContext();

    const isAdmin = useAuthStore(s => s.usuarioActivo)?.rol === 'ADMIN';
    const requireLogin = useAuthStore(s => s.requireLogin ?? false);
    const setRequireLogin = useAuthStore(s => s.setRequireLogin);
    const adminEmail = useAuthStore(s => s.adminEmail);
    const adminPassword = useAuthStore(s => s.adminPassword);
    const setAdminCredentials = useAuthStore(s => s.setAdminCredentials);

    const { deviceId, forceHeartbeat } = useSecurity();
    const { log: auditLog } = useAudit();
    const fileInputRef = useRef(null);
    const [activeTab, setActiveTab] = useState('negocio');
    const [idCopied, setIdCopied] = useState(false);
    const [isShareOpen, setIsShareOpen] = useState(false);
    const [importStatus, setImportStatus] = useState(null);
    const [statusMessage, setStatusMessage] = useState('');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteInput, setDeleteInput] = useState('');

    // Credenciales Locales
    const [inputEmail, setInputEmail] = useState(adminEmail || '');
    const [inputPassword, setInputPassword] = useState(adminPassword || '');
    const isCloudConfigured = Boolean(adminEmail && adminPassword);
    const [isCloudLogin, setIsCloudLogin] = useState(true);
    
    // UI states for Auth form
    const [inputPhone, setInputPhone] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [emailError, setEmailError] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [isRecoveringPassword, setIsRecoveringPassword] = useState(false);

    // Device limit & data conflict states
    const [deviceLimitError, setDeviceLimitError] = useState(null); // { devices: [...] }
    const [blockedDevices, setBlockedDevices] = useState([]);
    const [dataConflictPending, setDataConflictPending] = useState(null); // { email, cloudBackup, localBackup }

    // Business Data
    const [businessName, setBusinessName] = useState(() => localStorage.getItem('business_name') || '');
    const [businessRif, setBusinessRif] = useState(() => localStorage.getItem('business_rif') || '');
    const [paperWidth, setPaperWidth] = useState(() => localStorage.getItem('printer_paper_width') || '58');
    const [allowNegativeStock, setAllowNegativeStock] = useState(() => localStorage.getItem('allow_negative_stock') === 'true');
    const [autoLockMinutes, setAutoLockMinutes] = useState(() => localStorage.getItem('admin_auto_lock_minutes') || '3');

    // Filter tabs based on role
    const visibleTabs = TABS.filter(t => !t.adminOnly || isAdmin);

    // ─── HANDLERS ─────────────────────────────────────────
    const handleSaveBusinessData = () => {
        localStorage.setItem('business_name', businessName);
        localStorage.setItem('business_rif', businessRif);
        localStorage.setItem('printer_paper_width', paperWidth);
        localStorage.setItem('admin_auto_lock_minutes', autoLockMinutes);
        forceHeartbeat();
        showToast('Datos del negocio guardados', 'success');
        auditLog('CONFIG', 'NEGOCIO_ACTUALIZADO', `Datos negocio: ${businessName || 'sin nombre'}`);
        triggerHaptic?.();
    };

    const handleSaveCloudAccount_DEPRECATED = async () => {
        // Esta función fue reemplazada por la versión completa más abajo
        // Se deja como referencia. Ver handleSaveCloudAccount debajo.
    };

    // ─── HELPER: Apply a cloud backup to local storage ───────────────────────
    const applyCloudBackup = async (cloudBackup) => {
        const lf = localforage.createInstance({ name: 'BodegaApp', storeName: 'bodega_app_data' });
        if (cloudBackup.version === '2.0' && cloudBackup.data?.idb) {
            for (const [key, value] of Object.entries(cloudBackup.data.idb)) {
                await lf.setItem(key, value);
            }
            if (cloudBackup.data.ls) {
                for (const [key, value] of Object.entries(cloudBackup.data.ls)) {
                    localStorage.setItem(key, value);
                }
            }
        }
    };

    // ─── HELPER: Collect local backup payload ────────────────────────────────
    const collectLocalBackup = async () => {
        const idbKeys = [
            'bodega_products_v1', 'my_categories_v1',
            'bodega_sales_v1', 'bodega_customers_v1',
            'bodega_suppliers_v1', 'bodega_supplier_invoices_v1',
            'bodega_accounts_v2', 'bodega_pending_cart_v1',
            'payment_methods_v1', 'payment_methods_v2'
        ];
        const idbData = {};
        for (const key of idbKeys) {
            const data = await storageService.getItem(key, null);
            if (data !== null) idbData[key] = data;
        }
        const lsKeys = [
            'premium_token', 'street_rate_bs', 'catalog_use_auto_usdt',
            'catalog_custom_usdt_price', 'catalog_show_cash_price',
            'monitor_rates_v12', 'business_name', 'business_rif',
            'printer_paper_width', 'allow_negative_stock', 'cop_enabled',
            'auto_cop_enabled', 'tasa_cop', 'bodega_use_auto_rate',
            'bodega_custom_rate', 'bodega_inventory_view'
        ];
        const lsData = {};
        for (const key of lsKeys) {
            const val = localStorage.getItem(key);
            if (val !== null) lsData[key] = val;
        }
        return {
            timestamp: new Date().toISOString(),
            version: '2.0',
            appName: 'TasasAlDia_Bodegas_Cloud',
            data: { idb: idbData, ls: lsData }
        };
    };

    // ─── HELPER: Upload local backup to cloud ────────────────────────────────
    const uploadLocalBackup = async (email, backupData) => {
        const { error } = await supabaseCloud
            .from('cloud_backups')
            .upsert({
                email: email.toLowerCase(),
                backup_data: backupData,
                updated_at: new Date().toISOString()
            }, { onConflict: 'email' });
        if (error) throw error;
    };

    // ─── HELPER: Register or update device in account_devices ─────────────────
    const registerDevice = async (email) => {
        await supabaseCloud.from('account_devices').upsert({
            email: email.toLowerCase(),
            device_id: deviceId || 'UNKNOWN',
            device_alias: `Dispositivo ${navigator.platform || 'Web'}`,
            last_seen: new Date().toISOString()
        }, { onConflict: 'email,device_id' });
    };

    // ─── HANDLER: Data conflict resolution ──────────────────────────────────
    const handleDataConflictChoice = async (choice) => {
        if (!dataConflictPending) return;
        const { email, cloudBackup, localBackup } = dataConflictPending;
        setDataConflictPending(null);
        setImportStatus('loading');
        setStatusMessage('Aplicando tu elección...');
        try {
            if (choice === 'cloud') {
                // Restore cloud data to this device
                await applyCloudBackup(cloudBackup);
                showToast('Datos de la nube restaurados. Reiniciando...', 'success');
                setTimeout(() => window.location.reload(), 1500);
            } else {
                // Upload local data to cloud (overwrite)
                await uploadLocalBackup(email, localBackup);
                showToast('Datos locales guardados en la nube', 'success');
            }
            setAdminCredentials(email, inputPassword);
            auditLog('NUBE', 'CONFLICTO_RESUELTO', `Conflicto datos resuelto: usuario eligió ${choice}`);
            setImportStatus(null);
        } catch (err) {
            showToast(err.message || 'Error al resolver el conflicto', 'error');
            setImportStatus('error');
        }
    };

    // ─── HANDLER: Desvincular dispositivo más antiguo y reintentar ────────────
    const handleUnlinkOldestDevice = async () => {
        if (!blockedDevices.length || !inputEmail) return;
        setImportStatus('loading');
        setStatusMessage('Desvinculando dispositivo más antiguo...');
        try {
            // Sort by created_at ascending, remove the oldest
            const oldest = [...blockedDevices].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0];
            await supabaseCloud.from('account_devices')
                .delete()
                .eq('email', inputEmail.toLowerCase())
                .eq('device_id', oldest.device_id);
            setDeviceLimitError(null);
            setBlockedDevices([]);
            showToast(`"${oldest.device_alias}" desvinculado. Volviendo a conectar...`, 'success');
            await handleSaveCloudAccount();
        } catch (err) {
            showToast(err.message || 'Error al desvincular', 'error');
            setImportStatus('error');
        }
    };

    const handleSaveCloudAccount = async () => {
        // Reset errors
        setEmailError('');
        setPasswordError('');
        setDeviceLimitError(null);
        setBlockedDevices([]);

        let hasError = false;
        if (!inputEmail.includes('@')) {
            setEmailError('Formato de correo no válido');
            hasError = true;
        }
        if (inputPassword.length < 6) {
            setPasswordError('Mínimo 6 caracteres para mayor seguridad');
            hasError = true;
        }
        if (!isCloudLogin && !inputPhone.trim()) {
            showToast('El teléfono es obligatorio para registrarse', 'error');
            hasError = true;
        }
        if (hasError) {
            triggerHaptic?.();
            return;
        }

        const emailToUse = inputEmail.trim().toLowerCase();

        try {
            setImportStatus('loading');
            setStatusMessage('Autenticando en la nube...');

            // ── 1. Supabase Auth ────────────────────────────────────────────────
            if (supabaseCloud) {
                if (isCloudLogin) {
                    const { error: err } = await supabaseCloud.auth.signInWithPassword({
                        email: emailToUse,
                        password: inputPassword,
                    });
                    if (err) throw new Error('Error al iniciar sesión: ' + err.message);
                } else {
                    const { data, error: err } = await supabaseCloud.auth.signUp({
                        email: emailToUse,
                        password: inputPassword,
                        options: { data: { full_name: businessName || 'Bodega', phone: inputPhone } },
                    });
                    if (err) {
                        if (err.message.includes('already registered') || err.message.includes('User already registered')) {
                            throw new Error('Este correo ya está registrado. Selecciona "Entrar".');
                        }
                        throw new Error('Error en el registro: ' + err.message);
                    }
                    if (data?.user?.identities?.length === 0) throw new Error('Este correo ya está registrado. Selecciona "Entrar".');
                    if (data?.user && !data.session) {
                        showToast('Por favor, revisa tu correo y confirma tu cuenta.', 'success');
                        setImportStatus('awaiting_email_confirmation');
                        setStatusMessage('Por favor confirma tu correo...');
                        return;
                    }
                }
            }

            // ── 2. Control de dispositivos (máx. 2) ─────────────────────────────
            setStatusMessage('Verificando dispositivos autorizados...');
            const { data: existingDevices, error: devErr } = await supabaseCloud
                .from('account_devices')
                .select('*')
                .eq('email', emailToUse)
                .order('created_at', { ascending: true });

            if (!devErr && existingDevices) {
                const myDeviceRegistered = existingDevices.find(d => d.device_id === (deviceId || 'UNKNOWN'));
                const activeCount = existingDevices.length;

                if (!myDeviceRegistered && activeCount >= 2) {
                    // ❌ Límite alcanzado - mostrar error con opción de desvincular
                    setDeviceLimitError({ devices: existingDevices });
                    setBlockedDevices(existingDevices);
                    setImportStatus('error');
                    setStatusMessage('Límite de dispositivos alcanzado.');
                    triggerHaptic?.();
                    return;
                }
            }

            // ── 3. Fetch backup en la nube ───────────────────────────────────────
            setStatusMessage('Consultando backup en la nube...');
            const { data: cloudRow } = await supabaseCloud
                .from('cloud_backups')
                .select('backup_data')
                .eq('email', emailToUse)
                .maybeSingle();

            const cloudBackup = cloudRow?.backup_data || null;

            // ── 4. Recolectar datos locales ──────────────────────────────────────
            const localBackup = await collectLocalBackup();
            const hasLocalData = Object.keys(localBackup.data.idb).length > 0;
            const hasCloudData = cloudBackup && cloudBackup.data;

            if (isCloudLogin && hasCloudData && hasLocalData) {
                // ⚠️ Conflicto: ambos tienen datos → preguntar al usuario
                setDataConflictPending({ email: emailToUse, cloudBackup, localBackup });
                await registerDevice(emailToUse);
                setAdminCredentials(emailToUse, inputPassword);
                setImportStatus(null);
                setStatusMessage('');
                auditLog('NUBE', 'LOGIN_NUBE', `Login exitoso: ${emailToUse}`);
                return; // Modal de conflicto se muestra, usuario elige
            }

            if (isCloudLogin && hasCloudData && !hasLocalData) {
                // 🆕 Dispositivo nuevo/vacío: restaurar automáticamente
                setStatusMessage('Restaurando backup de la nube...');
                await applyCloudBackup(cloudBackup);
                await registerDevice(emailToUse);
                setAdminCredentials(emailToUse, inputPassword);
                showToast('Datos restaurados automáticamente desde la nube', 'success');
                auditLog('NUBE', 'RESTORE_AUTO', `Backup restaurado automaticamente para: ${emailToUse}`);
                triggerHaptic?.();
                setImportStatus('success');
                setStatusMessage('Restauración completa. Reiniciando...');
                setTimeout(() => window.location.reload(), 1500);
                return;
            }

            // ── 5. Subir datos locales a la nube (flujo normal) ─────────────────
            setStatusMessage('Guardando y sincronizando datos locales...');
            if (supabaseCloud) {
                await uploadLocalBackup(emailToUse, localBackup);

                // Registrar licencia inicial (Estación Maestra)
                try {
                    await supabaseCloud.from('cloud_licenses').upsert({
                        email: emailToUse,
                        device_id: deviceId || 'UNKNOWN_DEVICE',
                        license_type: 'trial',
                        days_remaining: 15,
                        business_name: businessName || 'Bodega',
                        phone: inputPhone || '',
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'email' });
                } catch (licErr) {
                    console.warn('Licencia cloud skip:', licErr);
                }

                await registerDevice(emailToUse);
            }

            setAdminCredentials(emailToUse, inputPassword);
            showToast(isCloudLogin ? 'Sesión iniciada y sincronizada' : 'Cuenta confirmada y sincronizada', 'success');
            auditLog('NUBE', isCloudLogin ? 'LOGIN_NUBE' : 'REGISTRO_NUBE', `Sincronización completa: ${emailToUse}`);
            triggerHaptic?.();
            setImportStatus(null);

        } catch (error) {
            console.error('Error sincronizando con la nube:', error);
            showToast(error.message || 'Hubo un error contactando la nube', 'error');
            setImportStatus('error');
        }
    };


    const handleResetPasswordRequest = async () => {
        setEmailError('');
        if (!inputEmail.includes('@')) {
            setEmailError('Ingresa un correo válido');
            return;
        }

        setImportStatus('loading');
        setStatusMessage('Enviando enlace...');
        try {
            const { error } = await supabaseCloud.auth.resetPasswordForEmail(inputEmail.toLowerCase().trim(), {
                redirectTo: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173',
            });
            if (error) throw error;
            showToast('Enlace enviado. Por favor revisa tu correo.', 'success');
            setIsRecoveringPassword(false);
            setImportStatus(null);
            setStatusMessage('');
        } catch (error) {
            console.error('Error al resetear password:', error);
            showToast(error.message || 'Error al enviar recuperación', 'error');
            setImportStatus('error');
            setStatusMessage('Error al enviar correo.');
        }
    };

    const handleExport = async () => {
        try {
            setImportStatus('loading');
            setStatusMessage('Generando backup completo...');
            
            const idbKeys = [
                'bodega_products_v1', 'my_categories_v1', 
                'bodega_sales_v1', 'bodega_customers_v1',
                'bodega_suppliers_v1', 'bodega_supplier_invoices_v1',
                'bodega_accounts_v2', 'bodega_pending_cart_v1',
                'payment_methods_v1', 'payment_methods_v2'
            ];
            const idbData = {};
            for (const key of idbKeys) {
                const data = await storageService.getItem(key, null);
                if (data !== null) idbData[key] = data;
            }

            const lsKeys = [
                'premium_token', 'street_rate_bs', 'catalog_use_auto_usdt', 
                'catalog_custom_usdt_price', 'catalog_show_cash_price', 
                'monitor_rates_v12', 'business_name', 'business_rif',
                'printer_paper_width', 'allow_negative_stock', 'cop_enabled',
                'auto_cop_enabled', 'tasa_cop', 'bodega_use_auto_rate',
                'bodega_custom_rate', 'bodega_inventory_view'
            ];
            const lsData = {};
            for (const key of lsKeys) {
                const val = localStorage.getItem(key);
                if (val !== null) lsData[key] = val;
            }

            const backupData = {
                timestamp: new Date().toISOString(),
                version: '2.0',
                appName: 'TasasAlDia_Bodegas',
                data: { idb: idbData, ls: lsData }
            };

            const blob = new Blob([JSON.stringify(backupData)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `backup_tasasaldia_completo_${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            setStatusMessage('Backup completo descargado.');
            setImportStatus('success');
            auditLog('SISTEMA', 'BACKUP_EXPORTADO', 'Backup completo exportado');
            setTimeout(() => setImportStatus(null), 3000);
        } catch (error) {
            console.error(error);
            setStatusMessage('Error al generar backup.');
            setImportStatus('error');
        }
    };

    const handleImportClick = () => fileInputRef.current?.click();

    const handleFileChange = (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                setImportStatus('loading');
                setStatusMessage('Restaurando cuenta entera...');
                const json = JSON.parse(e.target.result);
                
                if (!json.data) throw new Error('Formato invalido.');
                const lf = localforage.createInstance({ name: 'BodegaApp', storeName: 'bodega_app_data' });

                if (json.version === '2.0' && json.data.idb) {
                    for (const [key, value] of Object.entries(json.data.idb)) {
                        await lf.setItem(key, value);
                    }
                    if (json.data.ls) {
                        for (const [key, value] of Object.entries(json.data.ls)) {
                            localStorage.setItem(key, value);
                        }
                    }
                } else {
                    if (json.data.bodega_products_v1) {
                        await lf.setItem('bodega_products_v1', typeof json.data.bodega_products_v1 === 'string' ? JSON.parse(json.data.bodega_products_v1) : json.data.bodega_products_v1);
                    }
                    if (json.data.bodega_accounts_v2) {
                        await lf.setItem('bodega_accounts_v2', typeof json.data.bodega_accounts_v2 === 'string' ? JSON.parse(json.data.bodega_accounts_v2) : json.data.bodega_accounts_v2);
                    }
                    if (json.data.my_categories_v1) {
                        await lf.setItem('my_categories_v1', typeof json.data.my_categories_v1 === 'string' ? JSON.parse(json.data.my_categories_v1) : json.data.my_categories_v1);
                    }
                    
                    const legacyLsKeys = [
                        'street_rate_bs', 'catalog_use_auto_usdt', 'catalog_custom_usdt_price',
                        'catalog_show_cash_price', 'monitor_rates_v12', 'business_name', 'business_rif'
                    ];
                    for (const key of legacyLsKeys) {
                        if (json.data[key]) localStorage.setItem(key, json.data[key]);
                    }
                }

                setImportStatus('success');
                setStatusMessage('Clonacion finalizada. Reiniciando...');
                auditLog('SISTEMA', 'BACKUP_IMPORTADO', 'Backup restaurado desde archivo');
                triggerHaptic?.();
                
                setTimeout(() => window.location.reload(), 1500);
            } catch (error) {
                console.error(error);
                setImportStatus('error');
                setStatusMessage('Error: El archivo esta corrupto o es invalido.');
            }
        };
        reader.readAsText(file);
    };

    // ─── RENDER ───────────────────────────────────────────
    return (
        <div className="fixed inset-0 z-[150] bg-slate-50 dark:bg-slate-950 flex flex-col h-[100dvh] max-h-[100dvh] w-full overflow-hidden animate-in slide-in-from-right duration-300">

            {/* ════ MODAL: Conflicto de Datos ════ */}
            {dataConflictPending && (
                <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 backdrop-blur-sm p-4 pb-8 animate-in fade-in">
                    <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden">
                        <div className="bg-amber-500 px-5 py-4 text-white">
                            <div className="flex items-center gap-2 mb-1">
                                <AlertTriangle size={20} />
                                <span className="font-black text-base">Conflicto de Datos</span>
                            </div>
                            <p className="text-xs text-white/80">Este dispositivo ya tiene datos. ¿Con cuáles quieres quedarte?</p>
                        </div>
                        <div className="p-5 space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => handleDataConflictChoice('cloud')}
                                    className="flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 hover:border-indigo-400 active:scale-95 transition-all"
                                >
                                    <Database size={24} />
                                    <span className="text-xs font-black text-center leading-tight">Usar datos<br/>de la nube</span>
                                    <span className="text-[9px] text-indigo-400 text-center">
                                        {dataConflictPending?.cloudBackup?.timestamp
                                            ? `Guardado: ${new Date(dataConflictPending.cloudBackup.timestamp).toLocaleDateString('es-VE')}`
                                            : 'Backup en la nube'
                                        }
                                    </span>
                                </button>
                                <button
                                    onClick={() => handleDataConflictChoice('local')}
                                    className="flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 hover:border-emerald-400 active:scale-95 transition-all"
                                >
                                    <Download size={24} />
                                    <span className="text-xs font-black text-center leading-tight">Mantener datos<br/>de este equipo</span>
                                    <span className="text-[9px] text-emerald-400 text-center">Sube tus datos locales a la nube</span>
                                </button>
                            </div>
                            <p className="text-[9px] text-center text-slate-400 dark:text-slate-500 px-2">
                                La opción que no elijas se perderá. Esta acción no se puede deshacer.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* ════ MODAL: Límite de Dispositivos ════ */}
            {deviceLimitError && (
                <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 backdrop-blur-sm p-4 pb-8 animate-in fade-in">
                    <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden">
                        <div className="bg-red-500 px-5 py-4 text-white">
                            <div className="flex items-center gap-2 mb-1">
                                <AlertTriangle size={20} />
                                <span className="font-black text-base">Límite de Dispositivos</span>
                            </div>
                            <p className="text-xs text-white/80">Esta cuenta ya está activa en 2 dispositivos simultáneamente.</p>
                        </div>
                        <div className="p-5 space-y-3">
                            <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-2">Dispositivos activos:</p>
                            {blockedDevices.map((d, i) => (
                                <div key={d.device_id} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                                    <div className="w-8 h-8 bg-slate-200 dark:bg-slate-700 rounded-lg flex items-center justify-center shrink-0">
                                        <Fingerprint size={16} className="text-slate-500" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{d.device_alias || `Dispositivo ${i + 1}`}</p>
                                        <p className="text-[9px] text-slate-400">
                                            Registrado: {new Date(d.created_at).toLocaleDateString('es-VE')}
                                            {i === 0 && [...blockedDevices].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0]?.device_id === d.device_id
                                                ? ' · Más antiguo' : ''}
                                        </p>
                                    </div>
                                </div>
                            ))}
                            <button
                                onClick={handleUnlinkOldestDevice}
                                disabled={importStatus === 'loading'}
                                className="w-full mt-2 py-3 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white text-sm font-black rounded-2xl transition-all shadow-sm flex items-center justify-center gap-2 active:scale-[0.98]"
                            >
                                {importStatus === 'loading'
                                    ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    : <Trash2 size={16} />
                                }
                                Desvincular el dispositivo más antiguo
                            </button>
                            <button
                                onClick={() => { setDeviceLimitError(null); setBlockedDevices([]); setImportStatus(null); }}
                                className="w-full py-2 text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="shrink-0 px-4 pt-[env(safe-area-inset-top)] bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 shadow-sm">
                <div className="flex items-center gap-3 py-4">
                    <button
                        onClick={onClose}
                        className="p-2 -ml-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors active:scale-95"
                    >
                        <ArrowLeft size={20} className="text-slate-600 dark:text-slate-300" />
                    </button>
                    <h1 className="text-lg font-black text-slate-800 dark:text-white tracking-tight">Configuracion</h1>
                </div>

                {/* Tab Bar */}
                <div className="flex gap-1 -mb-px overflow-x-auto scrollbar-hide">
                    {visibleTabs.map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => { setActiveTab(tab.id); triggerHaptic?.(); }}
                                className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold rounded-t-xl transition-all whitespace-nowrap border-b-2 ${
                                    isActive
                                        ? 'text-indigo-600 dark:text-indigo-400 border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/10'
                                        : 'text-slate-400 border-transparent hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                }`}
                            >
                                <Icon size={14} />
                                <span className="hidden sm:inline">{tab.label}</span>
                                <span className="sm:hidden">{tab.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Body - scroll */}
            <div className="flex-1 overflow-y-auto pb-[calc(3rem+env(safe-area-inset-bottom))]">
                <div className="max-w-md mx-auto p-4 space-y-4">

                    {/* ═══ TAB: NEGOCIO ═══ */}
                    {activeTab === 'negocio' && (
                        <>
                            {/* Mi Negocio */}
                            <SectionCard icon={Store} title="Mi Negocio" subtitle="Datos que aparecen en tickets" iconColor="text-indigo-500">
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">Nombre del Negocio</label>
                                    <input
                                        type="text"
                                        placeholder="Ej: Mi Bodega C.A."
                                        value={businessName}
                                        onChange={e => setBusinessName(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">RIF o Documento</label>
                                    <input
                                        type="text"
                                        placeholder="Ej: J-12345678"
                                        value={businessRif}
                                        onChange={e => setBusinessRif(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all"
                                    />
                                </div>
                                <button
                                    onClick={handleSaveBusinessData}
                                    className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors active:scale-[0.98]"
                                >
                                    <Check size={16} /> Guardar
                                </button>
                            </SectionCard>

                            {/* Impresora */}
                            <SectionCard icon={Printer} title="Impresora" subtitle="Configuracion de papel termico" iconColor="text-violet-500">
                                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">Ancho de Papel</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {[{ val: '58', label: '58 mm (Pequena)' }, { val: '80', label: '80 mm (Estandar)' }].map(opt => (
                                        <button
                                            key={opt.val}
                                            onClick={() => { setPaperWidth(opt.val); localStorage.setItem('printer_paper_width', opt.val); triggerHaptic?.(); }}
                                            className={`py-2.5 px-3 text-xs font-bold rounded-xl transition-all border ${paperWidth === opt.val
                                                ? 'bg-violet-50 dark:bg-violet-900/20 border-violet-400 text-violet-700 dark:text-violet-300 shadow-sm'
                                                : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                                            }`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </SectionCard>

                            {/* Monedas COP */}
                            <SectionCard icon={Coins} title="Peso Colombiano (COP)" subtitle="Habilitar pagos y calculos en COP" iconColor="text-amber-500">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Habilitar COP</p>
                                        <p className="text-[10px] text-slate-400 mt-0.5">Pagos y calculos rapidos</p>
                                    </div>
                                    <Toggle
                                        enabled={copEnabled}
                                        color="amber"
                                        onChange={() => {
                                            const newVal = !copEnabled;
                                            setCopEnabled(newVal);
                                            localStorage.setItem('cop_enabled', newVal.toString());
                                            forceHeartbeat();
                                            showToast(newVal ? 'COP Habilitado' : 'COP Deshabilitado', 'success');
                                            triggerHaptic?.();
                                        }}
                                    />
                                </div>
                                {copEnabled && (
                                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-[13px] font-bold text-slate-700 dark:text-slate-200">Calcular Automaticamente</p>
                                                <p className="text-[10px] text-slate-400 mt-0.5">TRM Oficial + Binance USDT</p>
                                            </div>
                                            <Toggle
                                                enabled={autoCopEnabled}
                                                color="amber"
                                                onChange={() => {
                                                    const newVal = !autoCopEnabled;
                                                    setAutoCopEnabled(newVal);
                                                    localStorage.setItem('auto_cop_enabled', newVal.toString());
                                                    triggerHaptic?.();
                                                }}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">
                                                {autoCopEnabled ? 'Tasa Actual Calculada' : 'Tasa Manual (COP por 1 USD)'}
                                            </label>
                                            <input
                                                type="number"
                                                placeholder="Ej: 4150"
                                                value={autoCopEnabled ? (calculatedTasaCop > 0 ? calculatedTasaCop.toFixed(2) : '') : tasaCopManual}
                                                readOnly={autoCopEnabled}
                                                onChange={e => {
                                                    if (!autoCopEnabled) {
                                                        setTasaCopManual(e.target.value);
                                                        localStorage.setItem('tasa_cop', e.target.value);
                                                    }
                                                }}
                                                className={`w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/30 ${autoCopEnabled ? 'text-slate-400 cursor-not-allowed bg-slate-100 dark:bg-slate-800/80' : 'text-amber-600 dark:text-amber-500'}`}
                                            />
                                            {autoCopEnabled && (
                                                <p className="text-[9px] text-amber-600/70 dark:text-amber-400/70 mt-1.5 font-medium">Se actualiza automaticamente cada 30 segundos.</p>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </SectionCard>
                        </>
                    )}

                    {/* ═══ TAB: VENTAS ═══ */}
                    {activeTab === 'ventas' && (
                        <>
                            <SectionCard icon={Package} title="Inventario" subtitle="Reglas de ventas" iconColor="text-emerald-500">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Vender sin Stock</p>
                                        <p className="text-[10px] text-slate-400 mt-0.5">Permitir ventas si el inventario es 0</p>
                                    </div>
                                    <Toggle
                                        enabled={allowNegativeStock}
                                        onChange={() => {
                                            const newVal = !allowNegativeStock;
                                            setAllowNegativeStock(newVal);
                                            localStorage.setItem('allow_negative_stock', newVal.toString());
                                            forceHeartbeat();
                                            showToast(newVal ? 'Se permite vender sin stock' : 'No se permite vender sin stock', 'success');
                                            triggerHaptic?.();
                                        }}
                                    />
                                </div>
                            </SectionCard>

                            <SectionCard icon={CreditCard} title="Metodos de Pago" subtitle="Configura como te pagan" iconColor="text-blue-500">
                                <PaymentMethodsManager triggerHaptic={triggerHaptic} />
                            </SectionCard>
                        </>
                    )}

                    {/* ═══ TAB: USUARIOS ═══ */}
                    {activeTab === 'usuarios' && isAdmin && (
                        <>
                            {isCloudConfigured && (
                                <SectionCard icon={Users} title="Usuarios y Roles" subtitle="Gestiona quien opera la app" iconColor="text-indigo-500">
                                    <UsersManager triggerHaptic={triggerHaptic} />
                                </SectionCard>
                            )}

                            <SectionCard icon={Lock} title="Seguridad (ADMIN)" subtitle="Evitar accesos no autorizados" iconColor="text-rose-500">
                                
                                {/* Formulario Correo Nube */}
                                {!isCloudConfigured && (
                                    <div className="mb-5 p-3.5 bg-rose-50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-900/30 rounded-2xl animate-in fade-in zoom-in-95">
                                        <div className="flex items-start gap-2.5 mb-3">
                                            <AlertTriangle size={16} className="text-rose-500 mt-0.5 shrink-0" />
                                            <div>
                                                <p className="text-xs font-bold text-rose-700 dark:text-rose-400">Protección Requerida</p>
                                                <p className="text-[10px] text-rose-600/80 dark:text-rose-400/80 leading-relaxed mt-0.5">
                                                    Para crear nuevos usuarios, modificar las alertas de seguridad o deshabilitar el PIN de la aplicación, debes registrar primero un correo y contraseña de recuperación.
                                                </p>
                                            </div>
                                        </div>

                                        {/* Formulario de Auth Nube Real */}
                                        <div className="bg-white dark:bg-slate-900 border border-rose-200/60 dark:border-rose-900/40 rounded-xl p-4 mt-3 shadow-inner">
                                            {/* Tabs Login/Registro */}
                                            <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1 mb-4">
                                                <button
                                                    onClick={() => setIsCloudLogin(true)}
                                                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${isCloudLogin ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-slate-500 hover:text-slate-700'}`}
                                                >
                                                    Entrar
                                                </button>
                                                <button
                                                    onClick={() => setIsCloudLogin(false)}
                                                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${!isCloudLogin ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-slate-500 hover:text-slate-700'}`}
                                                >
                                                    Registrarse
                                                </button>
                                            </div>

                                            {importStatus === 'awaiting_email_confirmation' ? (
                                                <div className="text-center py-6 px-4 animate-in fade-in zoom-in">
                                                    <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                                                        <Mail size={32} className="text-indigo-500" />
                                                    </div>
                                                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-2">¡Revisa tu correo!</h3>
                                                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
                                                        Hemos enviado un enlace de confirmación a <strong className="text-slate-700 dark:text-slate-300">{inputEmail}</strong>. 
                                                        Por favor haz clic en él para verificar tu identidad y luego regresa aquí para Iniciar Sesión.
                                                    </p>
                                                    <button
                                                        onClick={() => {
                                                            setImportStatus(null);
                                                            setIsCloudLogin(true); // Cambiamos a Login para cuando regrese
                                                        }}
                                                        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-colors active:scale-95"
                                                    >
                                                        Ya lo confirmé, Iniciar Sesión
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="space-y-3">
                                                    {!isCloudLogin && (
                                                        <div className="space-y-1">
                                                            <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">Teléfono Móvil</label>
                                                            <div className="relative">
                                                                <input
                                                                    type="tel"
                                                                    placeholder="Ej: 0414..."
                                                                    value={inputPhone}
                                                                    onChange={e => setInputPhone(e.target.value)}
                                                                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-10 pr-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/30 outline-none"
                                                                />
                                                                <Database size={16} className="absolute left-3.5 top-3 text-slate-400" />
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div className="space-y-1">
                                                        <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">Correo Electrónico</label>
                                                        <div className="relative">
                                                            <input
                                                                type="email"
                                                                placeholder="tu@correo.com"
                                                                value={inputEmail}
                                                                onChange={e => {
                                                                    setInputEmail(e.target.value);
                                                                    setEmailError('');
                                                                }}
                                                                className={`w-full bg-slate-50 dark:bg-slate-950 border ${emailError ? 'border-red-400' : 'border-slate-200 dark:border-slate-800'} rounded-xl pl-10 pr-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/30 outline-none transition-all`}
                                                            />
                                                            <Mail size={16} className={`absolute left-3.5 top-3 ${emailError ? 'text-red-400' : 'text-slate-400'}`} />
                                                        </div>
                                                        {emailError && <p className="text-[10px] text-red-500 mt-1 ml-1 font-medium">{emailError}</p>}
                                                    </div>

                                                    {!isRecoveringPassword && (
                                                        <div className="space-y-1">
                                                            <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">Contraseña</label>
                                                            <div className="relative">
                                                                <input
                                                                    type={showPassword ? 'text' : 'password'}
                                                                    placeholder="Mínimo 6 caracteres"
                                                                    value={inputPassword}
                                                                    onChange={e => {
                                                                        setInputPassword(e.target.value);
                                                                        setPasswordError('');
                                                                    }}
                                                                    className={`w-full bg-slate-50 dark:bg-slate-950 border ${passwordError ? 'border-red-400' : 'border-slate-200 dark:border-slate-800'} rounded-xl pl-10 pr-10 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/30 outline-none transition-all`}
                                                                />
                                                                <Lock size={16} className={`absolute left-3.5 top-3 ${passwordError ? 'text-red-400' : 'text-slate-400'}`} />
                                                                <button 
                                                                    type="button" 
                                                                    onClick={() => setShowPassword(!showPassword)}
                                                                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 focus:outline-none"
                                                                >
                                                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                                                </button>
                                                            </div>
                                                            {passwordError && <p className="text-[10px] text-red-500 mt-1 ml-1 font-medium">{passwordError}</p>}
                                                        </div>
                                                    )}

                                                    {importStatus === 'error' && (
                                                        <div className="p-2.5 mt-2 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg flex items-center gap-2">
                                                            <AlertTriangle size={14} className="text-red-500 shrink-0" />
                                                            <p className="text-[10px] text-red-600 dark:text-red-400 font-medium">{statusMessage}</p>
                                                        </div>
                                                    )}

                                                    <button
                                                        onClick={isRecoveringPassword ? handleResetPasswordRequest : handleSaveCloudAccount}
                                                        disabled={importStatus === 'loading'}
                                                        className="w-full mt-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 dark:disabled:bg-indigo-800 text-white text-sm font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
                                                    >
                                                        {importStatus === 'loading' ? (
                                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                        ) : (
                                                            <ShieldCheck size={18} />
                                                        )}
                                                        {importStatus === 'loading' ? 'Procesando...' : (
                                                            isRecoveringPassword ? 'Enviar enlace de recuperación' :
                                                            (isCloudLogin ? 'Entrar y Sincronizar' : 'Crear Cuenta Segura')
                                                        )}
                                                    </button>
                                                    
                                                    <div className="flex flex-col items-center mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                                                        {isCloudLogin && !isRecoveringPassword && (
                                                            <button 
                                                                type="button"
                                                                onClick={() => {
                                                                    setIsRecoveringPassword(true);
                                                                    setImportStatus(null);
                                                                    setStatusMessage('');
                                                                    setEmailError('');
                                                                    setPasswordError('');
                                                                }}
                                                                className="text-[11px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline mb-2"
                                                            >
                                                                ¿Olvidaste tu contraseña?
                                                            </button>
                                                        )}

                                                        {isRecoveringPassword && (
                                                            <button 
                                                                type="button"
                                                                onClick={() => {
                                                                    setIsRecoveringPassword(false);
                                                                    setImportStatus(null);
                                                                    setStatusMessage('');
                                                                    setEmailError('');
                                                                }}
                                                                className="text-[11px] text-slate-500 font-bold hover:underline mb-2"
                                                            >
                                                                Volver a Iniciar Sesión
                                                            </button>
                                                        )}

                                                        {!isCloudLogin && !isRecoveringPassword && (
                                                            <p className="text-[9px] text-center text-slate-400 dark:text-slate-500 leading-relaxed">
                                                                Al registrarte, enviaremos un correo de validación. Tu información será encriptada y quedará lista para la próxima <strong>Estación Maestra</strong>.
                                                            </p>
                                                        )}

                                                        {isRecoveringPassword && (
                                                            <p className="text-[9px] text-center text-slate-400 dark:text-slate-500 leading-relaxed max-w-[200px]">
                                                                Ingresa el correo de tu cuenta. Te enviaremos un mensaje con un enlace para crear una contraseña nueva.
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {isCloudConfigured && (
                                    <div className="mb-5 p-3.5 bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 rounded-2xl flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/40 rounded-full flex items-center justify-center">
                                                <Database size={20} className="text-indigo-600 dark:text-indigo-400" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Sincronización Activa</p>
                                                <p className="text-[10px] text-slate-500">{adminEmail}</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={async () => {
                                                if (window.confirm('¿Seguro que deseas cerrar la sesión en la nube?')) {
                                                    setAdminCredentials('', '');
                                                    if (supabaseCloud) await supabaseCloud.auth.signOut();
                                                    showToast('Sesión de nube cerrada', 'success');
                                                }
                                            }}
                                            className="px-3 py-1.5 bg-white dark:bg-slate-800 text-red-500 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm hover:bg-red-50 dark:hover:bg-red-900/20 active:scale-95 transition-all"
                                        >
                                            Cerrar Sesión
                                        </button>
                                    </div>
                                )}

                                    {/* Login Opcional */}
                                    <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-4 mt-6">
                                        <div>
                                            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Pedir PIN al iniciar</p>
                                            <p className="text-[10px] text-slate-400 mt-0.5">Si se desactiva, entrará directo como Administrador.</p>
                                        </div>
                                        <Toggle
                                            enabled={requireLogin}
                                            color="rose"
                                            onChange={() => {
                                                const newVal = !requireLogin;
                                                if (setRequireLogin) setRequireLogin(newVal);
                                                triggerHaptic?.();
                                                showToast(newVal ? 'PIN activado para inicio' : 'Acceso directo activado', 'success');
                                            }}
                                        />
                                    </div>

                                    {/* Bloqueo por inactividad */}
                                    <div className={`transition-opacity ${!requireLogin ? 'opacity-50 pointer-events-none' : ''}`}>
                                        <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">Bloqueo Automático</label>
                                        <p className="text-[10px] text-slate-400 mb-3">Tu sesión se bloqueará tras estos minutos de inactividad.</p>
                                        <div className="grid grid-cols-4 gap-2">

                                        {[
                                            { val: '1', label: '1m' },
                                            { val: '3', label: '3m' },
                                            { val: '5', label: '5m' },
                                            { val: '10', label: '10m' }
                                        ].map(opt => (
                                            <button
                                                key={opt.val}
                                                onClick={() => { 
                                                    setAutoLockMinutes(opt.val); 
                                                    localStorage.setItem('admin_auto_lock_minutes', opt.val); 
                                                    triggerHaptic?.(); 
                                                }}
                                                className={`py-2 text-xs font-bold rounded-xl transition-all border ${autoLockMinutes === opt.val
                                                    ? 'bg-rose-50 dark:bg-rose-900/20 border-rose-400 text-rose-700 dark:text-rose-300 shadow-sm'
                                                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                                                }`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                        </div>
                                    </div>
                                </SectionCard>
                        </>
                    )}

                    {/* ═══ TAB: SISTEMA ═══ */}
                    {activeTab === 'sistema' && (
                        <>
                            {/* Datos y Respaldo */}
                            <SectionCard icon={Database} title="Datos y Respaldo" subtitle="Exportar, importar y compartir" iconColor="text-cyan-500">
                                <div className="p-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/30 rounded-xl flex gap-2.5">
                                    <AlertTriangle size={18} className="text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
                                    <p className="text-[10px] text-amber-800 dark:text-amber-400 leading-relaxed font-bold">
                                        PRECAUCION: Al restaurar un backup se sobrescribira por completo todo el historial de ventas, inventario, deudores y configuraciones de este dispositivo.
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <button onClick={handleExport} className="w-full flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group active:scale-[0.98]">
                                        <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg"><Download size={18} className="text-blue-500" /></div>
                                        <div className="text-left flex-1">
                                            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Exportar Backup</p>
                                            <p className="text-[10px] text-slate-400">Descargar archivo .json</p>
                                        </div>
                                        <ChevronRight size={16} className="text-slate-300" />
                                    </button>

                                    <button onClick={handleImportClick} className="w-full flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group active:scale-[0.98]">
                                        <div className="p-2 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg"><Upload size={18} className="text-emerald-500" /></div>
                                        <div className="text-left flex-1">
                                            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Importar Backup</p>
                                            <p className="text-[10px] text-slate-400">Restaurar desde archivo</p>
                                        </div>
                                        <ChevronRight size={16} className="text-slate-300" />
                                    </button>

                                    <button onClick={() => setIsShareOpen(true)} className="w-full flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group active:scale-[0.98]">
                                        <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg"><Share2 size={18} className="text-indigo-500" /></div>
                                        <div className="text-left flex-1">
                                            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Compartir Inventario</p>
                                            <p className="text-[10px] text-slate-400">Codigo de 6 digitos, 24h</p>
                                        </div>
                                        <ChevronRight size={16} className="text-slate-300" />
                                    </button>
                                </div>

                                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" className="hidden" />

                                {importStatus && (
                                    <div className={`p-2.5 rounded-xl text-xs font-bold text-center flex items-center justify-center gap-2 ${importStatus === 'success' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                                        {importStatus === 'success' ? <Check size={14} /> : <AlertTriangle size={14} />}
                                        {statusMessage}
                                    </div>
                                )}
                            </SectionCard>

                            {/* Apariencia */}
                            <SectionCard icon={Palette} title="Apariencia" subtitle="Estilo visual de la app" iconColor="text-pink-500">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        {theme === 'dark' ? <Moon size={18} className="text-indigo-400" /> : <Sun size={18} className="text-amber-500" />}
                                        <div>
                                            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{theme === 'dark' ? 'Modo Oscuro' : 'Modo Claro'}</p>
                                            <p className="text-[10px] text-slate-400 mt-0.5">Toca para cambiar</p>
                                        </div>
                                    </div>
                                    <Toggle
                                        enabled={theme === 'dark'}
                                        color="indigo"
                                        onChange={() => { toggleTheme(); triggerHaptic?.(); }}
                                    />
                                </div>
                            </SectionCard>

                            {/* Dispositivo */}
                            <SectionCard icon={Fingerprint} title="Dispositivo" subtitle="Informacion tecnica" iconColor="text-slate-500">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="text-[9px] uppercase tracking-wider font-bold text-slate-400 mb-1">ID de Instalacion</p>
                                        <p className="font-mono text-xs font-black text-slate-600 dark:text-slate-300 select-all truncate">{deviceId || '...'}</p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(deviceId).then(() => {
                                                setIdCopied(true);
                                                setTimeout(() => setIdCopied(false), 2000);
                                            });
                                        }}
                                        className="shrink-0 p-2 rounded-lg text-slate-400 hover:text-teal-500 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-all"
                                    >
                                        {idCopied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                                    </button>
                                </div>
                                <p className="text-[9px] text-slate-400">Comparte este ID si necesitas soporte tecnico.</p>
                            </SectionCard>

                            {/* Audit Log */}
                            {isAdmin && (
                                <SectionCard icon={FileText} title="Bitacora de Actividad" subtitle="Registro de todas las acciones" iconColor="text-slate-500">
                                    <AuditLogViewer triggerHaptic={triggerHaptic} />
                                </SectionCard>
                            )}

                            {/* Zona de Peligro */}
                            <SectionCard icon={AlertTriangle} title="Zona de Peligro" subtitle="Acciones irreversibles" iconColor="text-red-500">
                                <div className="p-2.5 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/30 rounded-xl mb-3">
                                    <p className="text-[10px] text-red-700 dark:text-red-400 leading-relaxed font-bold">
                                        Esta accion eliminara todo el historial de ventas y reportes estadisticos. El inventario NO sera afectado.
                                    </p>
                                </div>
                                <button
                                    onClick={() => setShowDeleteConfirm(true)}
                                    className="w-full flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors group active:scale-[0.98]"
                                >
                                    <div className="p-2 bg-red-100 dark:bg-red-900/40 rounded-lg"><Trash2 size={18} className="text-red-600 dark:text-red-400" /></div>
                                    <div className="text-left flex-1">
                                        <p className="text-sm font-bold text-red-700 dark:text-red-400">Borrar Historial de Ventas</p>
                                        <p className="text-[10px] text-red-500/80 dark:text-red-400/80">El inventario no se borrara</p>
                                    </div>
                                </button>
                            </SectionCard>
                        </>
                    )}

                    {/* Version footer */}
                    <div className="text-center py-4">
                        <p className="text-[10px] text-slate-300 dark:text-slate-600 font-bold">PreciosAlDia Bodegas v1.0</p>
                    </div>
                </div>
            </div>

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowDeleteConfirm(false)}>
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200 text-center" onClick={e => e.stopPropagation()}>
                        <div className="w-16 h-16 mx-auto bg-red-100 dark:bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mb-4">
                            <AlertTriangle size={32} />
                        </div>
                        <h3 className="text-xl font-black text-slate-800 dark:text-white mb-2">Estas seguro?</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                            Esta accion eliminara <strong>todo el historial de ventas</strong> y dejara las estadisticas en cero.
                            <br/><br/>
                            Para confirmar, escribe <span className="font-mono font-bold text-red-500 bg-red-50 dark:bg-red-900/40 px-1 rounded">ELIMINAR</span> abajo:
                        </p>
                        <input
                            type="text"
                            value={deleteInput}
                            onChange={e => setDeleteInput(e.target.value.toUpperCase())}
                            placeholder="Escribe ELIMINAR"
                            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-center font-mono font-bold text-slate-800 dark:text-white mb-4 focus:ring-2 focus:ring-red-500/50 outline-none uppercase transition-colors"
                            autoFocus
                        />
                        <div className="flex gap-3">
                            <button
                                onClick={() => { setShowDeleteConfirm(false); setDeleteInput(''); }}
                                className="flex-1 py-3 text-sm font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                disabled={deleteInput !== 'ELIMINAR'}
                                onClick={async () => {
                                    if (deleteInput === 'ELIMINAR') {
                                        try {
                                            triggerHaptic && triggerHaptic();
                                            await storageService.removeItem('bodega_sales_v1');
                                            auditLog('SISTEMA', 'HISTORIAL_BORRADO', 'Historial de ventas eliminado completamente');
                                            showToast('Historial de ventas eliminado exitosamente', 'success');
                                            setTimeout(() => window.location.reload(), 1500);
                                        } catch (err) {
                                            showToast('Error eliminando historial', 'error');
                                        }
                                    }
                                }}
                                className="flex-1 py-3 text-sm font-bold text-white bg-red-500 rounded-xl hover:bg-red-600 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Si, borrar todo
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ShareInventoryModal
                isOpen={isShareOpen} 
                onClose={() => setIsShareOpen(false)} 
                products={products} 
                categories={categories}
                onImport={({ products: imported, categories: importedCats }) => {
                    if (importedCats && importedCats.length > 0) setCategories(importedCats);
                    if (imported && imported.length > 0) setProducts(imported);
                    showToast('Inventario importado correctamente', 'success');
                    setIsShareOpen(false);
                }}
            />
        </div>
    );
}
