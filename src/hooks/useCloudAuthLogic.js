import { useState, useEffect } from 'react';
import { supabaseCloud } from '../config/supabaseCloud';
import { storageService } from '../utils/storageService';
import { useAudit } from './useAudit';
import { useSecurity } from './useSecurity';
import { showToast } from '../components/Toast';

export function useCloudAuthLogic() {
    // Tomamos businessName del localStorage directamente
    const businessName = localStorage.getItem('business_name') || '';

    const { deviceId } = useSecurity();
    const { log: auditLog } = useAudit();

    // ─── STATE ──────────────────────────────────────────
    const [inputEmail, setInputEmail] = useState('');
    const [inputPassword, setInputPassword] = useState(''); // ← Siempre en blanco por seguridad
    // Cloud is configured if there is an active Supabase session (checked asynchronously)
    const [isCloudConfigured, setIsCloudConfigured] = useState(false);
    const [isCloudLogin, setIsCloudLogin] = useState(true);

    // Check if there is an active Supabase session (replaces stored credentials)
    useEffect(() => {
        supabaseCloud.auth.getSession().then(({ data: { session } }) => {
            setIsCloudConfigured(!!session);
        }).catch(() => {});
    }, []);
    
    const [localDeviceAlias, _setLocalDeviceAlias] = useState(() => localStorage.getItem('pda_device_alias') || '');
    
    const setLocalDeviceAlias = (val) => {
        _setLocalDeviceAlias(val);
        localStorage.setItem('pda_device_alias', val);
    };
    const [inputPhone, setInputPhone] = useState('');
    const [emailError, setEmailError] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [isRecoveringPassword, setIsRecoveringPassword] = useState(false);

    const [deviceLimitError, setDeviceLimitError] = useState(null);
    const [blockedDevices, setBlockedDevices] = useState([]);
    const [dataConflictPending, setDataConflictPending] = useState(null);
    
    const [importStatus, setImportStatus] = useState(null);
    const [statusMessage, setStatusMessage] = useState('');

    // ─── HELPERS ──────────────────────────────────────────
    const applyCloudBackup = async (cloudBackup) => {
        if (!cloudBackup?.data) {
            throw new Error('El backup de la nube está vacío o es inválido.');
        }
        if (cloudBackup.version === '2.0' && cloudBackup.data.idb) {
            const idbEntries = Object.entries(cloudBackup.data.idb);
            for (const [key, value] of idbEntries) {
                await storageService.setItem(key, value);
            }
        }
        if (cloudBackup.data.ls) {
            for (const [key, value] of Object.entries(cloudBackup.data.ls)) {
                localStorage.setItem(key, value);
            }
        }
    };

    const collectLocalBackup = async () => {
        const idbKeys = [
            'bodega_products_v1', 'poolbar_categories_v1',
            'bodega_sales_v1', 'bodega_customers_v1',
            'bodega_suppliers_v1', 'bodega_supplier_invoices_v1',
            'bodega_accounts_v2', 'bodega_pending_cart_v1',
            'payment_methods_v1', 'payment_methods_v2',
            'abasto_audit_log_v1',
            'active_sessions', 'tables', 'pool_config',
            'active_orders', 'active_order_items', 'active_cash_session',
            'offline_sales_queue',
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
            'bodega_custom_rate', 'bodega_inventory_view', 'abasto-auth-storage',
            'theme', 'cajero_puede_ver_mesas', 'cajero_puede_abrir_caja',
            'cajero_puede_cerrar_caja', 'max_discount_cajero',
            'admin_auto_lock_on_minimize', 'admin_auto_lock_minutes',
            'pda_device_alias',
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

    const uploadLocalBackup = async (email, backupData) => {
        // Ensure we have an active session before upserting (RLS requires auth.jwt()->>'email')
        const { data: { session } } = await supabaseCloud.auth.getSession();
        if (!session?.user?.id) {
            console.warn('[CloudAuth] No active session — skipping cloud_backups upsert');
            return;
        }

        const { error } = await supabaseCloud
            .from('cloud_backups')
            .upsert({
                user_id: session.user.id,
                email: email.toLowerCase(),
                backup_data: backupData,
                updated_at: new Date().toISOString()
            }, { onConflict: 'email' });
        if (error) throw error;

        try {
            const { data: { session } } = await supabaseCloud.auth.getSession();
            if (session?.user?.id) {
                const syncPayloads = [];
                for (const [key, value] of Object.entries(backupData.data.idb || {})) {
                    syncPayloads.push({
                        user_id: session.user.id,
                        collection: 'store',
                        doc_id: key,
                        data: { payload: value },
                        updated_at: new Date().toISOString()
                    });
                }
                for (const [key, value] of Object.entries(backupData.data.ls || {})) {
                    let finalVal = value;
                    try { finalVal = JSON.parse(value); } catch(e) { /* ignore parse errors */ }
                    syncPayloads.push({
                        user_id: session.user.id,
                        collection: 'local',
                        doc_id: key,
                        data: { payload: finalVal },
                        updated_at: new Date().toISOString()
                    });
                }
                if (syncPayloads.length > 0) {
                    await supabaseCloud.from('sync_documents').upsert(syncPayloads, { onConflict: 'user_id,collection,doc_id' });
                }
            }
        } catch(syncErr) {
            console.warn('[Realtime Sync Init] Fallo inicializando sync_documents:', syncErr);
        }
    };

    const registerDevice = async (email) => {
        const { data: { session } } = await supabaseCloud.auth.getSession();
        if (!session?.user?.id) throw new Error('No hay sesión cloud activa');
        const { error } = await supabaseCloud.from('account_devices').upsert({
            user_id: session.user.id,
            email: email.toLowerCase(),
            device_id: deviceId || 'UNKNOWN',
            device_alias: localDeviceAlias.trim() || `Dispositivo ${navigator.platform || 'Web'}`,
            last_seen: new Date().toISOString()
        }, { onConflict: 'email,device_id' });
        if (error) throw error;
    };

    // ─── ACTION HANDLERS ────────────────────────────────
    const handleDataConflictChoice = async (choice) => {
        if (!dataConflictPending) return;
        const { email, cloudBackup, localBackup } = dataConflictPending;
        setImportStatus('loading');
        setStatusMessage('Aplicando elección...');
        try {
            if (choice === 'cloud') {
                await applyCloudBackup(cloudBackup);
                await registerDevice(email);
                showToast('Datos de la nube restaurados correctamente.', 'success');
                setImportStatus('success');
                setStatusMessage('Datos de la nube restaurados.');
            } else {
                await uploadLocalBackup(email, localBackup);
                await registerDevice(email);
                showToast('Datos locales guardados en la nube', 'success');
                setImportStatus('success');
                setStatusMessage('Datos locales guardados.');
            }
            localStorage.removeItem('pda_explicit_login');
            localStorage.setItem('poolbar_cloud_email', email);
            localStorage.setItem('pool_had_cloud_session', 'true');
            setDataConflictPending(null);
            setIsCloudConfigured(true);
            auditLog('NUBE', 'CONFLICTO_RESUELTO', `Resuelto: ${choice}`);
            setTimeout(() => window.location.reload(), 1200);
        } catch (err) {
            showToast(err.message || 'Error resolviendo', 'error');
            setImportStatus('error');
        }
    };

    const handleUnlinkSpecificDevice = async (deviceToUnlinkId) => {
        if (!inputEmail || !deviceToUnlinkId) return;
        localStorage.setItem('pda_explicit_login', 'true');
        setImportStatus('loading');
        setStatusMessage('Desvinculando equipo...');
        try {
            let { data: { session } } = await supabaseCloud.auth.getSession().catch(() => ({ data: {} }));
            if (!session?.user?.id && inputPassword) {
                const { data: signInData, error: signInErr } = await supabaseCloud.auth.signInWithPassword({
                    email: inputEmail.trim().toLowerCase(),
                    password: inputPassword
                });
                if (!signInErr && signInData?.session?.user?.id) {
                    session = signInData.session;
                }
            }

            if (!session?.user?.id) {
                setDeviceLimitError(null);
                setBlockedDevices([]);
                await supabaseCloud.auth.signOut().catch(() => {});
                showToast('Sesión cloud expirada. Inicia sesión nuevamente.', 'error');
                return;
            }

            const { error } = await supabaseCloud.rpc('remove_my_device', { p_device_id: deviceToUnlinkId });
            if (error) {
                if (error.code === '42883' || /function .*remove_my_device.*does not exist/i.test(error.message || '')) {
                    throw new Error('Falta aplicar module1_device_admin_rpc.sql en Supabase.');
                }
                if (error.code === '42501' || /401|permission denied|unauthori[sz]ed/i.test(error.message || '')) {
                    await supabaseCloud.auth.signOut().catch(() => {});
                    setDeviceLimitError(null);
                    setBlockedDevices([]);
                    throw new Error('Sesión expirada. Inicia sesión nuevamente.');
                }
                throw error;
            }
            setDeviceLimitError(null);
            setBlockedDevices([]);
            showToast(`Equipo desvinculado. Reintentando conexión...`, 'success');
            await handleSaveCloudAccount();
        } catch (err) {
            showToast(err.message || 'Error desvinculando', 'error');
            setImportStatus('error');
        }
    };

    const handleUnlinkAllOtherDevices = async () => {
        if (!inputEmail) return;
        localStorage.setItem('pda_explicit_login', 'true');
        setImportStatus('loading');
        setStatusMessage('Expulsando equipos anteriores...');
        try {
            let { data: { session } } = await supabaseCloud.auth.getSession().catch(() => ({ data: {} }));
            if (!session?.user?.id && inputPassword) {
                const { data: signInData, error: signInErr } = await supabaseCloud.auth.signInWithPassword({
                    email: inputEmail.trim().toLowerCase(),
                    password: inputPassword
                });
                if (!signInErr && signInData?.session?.user?.id) {
                    session = signInData.session;
                }
            }
            if (!session?.user?.id) {
                throw new Error('Sesión cloud expirada. Inicia sesión nuevamente.');
            }

            const otherDevices = blockedDevices.filter(d => d.device_id !== deviceLimitError?.currentId);
            for (const d of otherDevices) {
                await supabaseCloud.rpc('remove_my_device', { p_device_id: d.device_id });
            }
            setDeviceLimitError(null);
            setBlockedDevices([]);
            showToast('Equipos anteriores desvinculados.', 'success');
            await handleSaveCloudAccount();
        } catch (err) {
            showToast(err.message || 'Error expulsando equipos', 'error');
            setImportStatus('error');
        }
    };

    const handleSaveCloudAccount = async () => {
        setEmailError('');
        setPasswordError('');
        setDeviceLimitError(null);
        setBlockedDevices([]);

        let hasError = false;
        if (!inputEmail.includes('@')) { setEmailError('Formato no válido'); hasError = true; }
        if (inputPassword.length < 6) { setPasswordError('Mínimo 6 caracteres'); hasError = true; }
        if (!isCloudLogin && !inputPhone.trim()) { showToast('El teléfono es obligatorio', 'error'); hasError = true; }
        
        if (hasError) return;

        const emailToUse = inputEmail.trim().toLowerCase();

        try {
            setImportStatus('loading');
            setStatusMessage('Autenticando...');

            if (supabaseCloud) {
                if (isCloudLogin) {
                    const { data: signInData, error: err } = await supabaseCloud.auth.signInWithPassword({
                        email: emailToUse, password: inputPassword,
                    });
                    if (err) throw new Error('Error al iniciar: ' + err.message);
                    if (!signInData?.session?.user?.id) throw new Error('La sesión cloud no fue emitida.');
                } else {
                    const { data, error: err } = await supabaseCloud.auth.signUp({
                        email: emailToUse, password: inputPassword,
                        options: { data: { full_name: businessName || 'Bodega', phone: inputPhone } },
                    });
                    if (err) {
                        if (err.message.includes('already registered')) throw new Error('Ya registrado. Entrar.');
                        throw new Error('Registro falló: ' + err.message);
                    }
                    if (data?.user?.identities?.length === 0) throw new Error('Ya registrado. Entrar.');
                    if (data?.user && !data.session) {
                        showToast('Revisa tu correo y confírmalo.', 'success');
                        setImportStatus('awaiting_email_confirmation');
                        return;
                    }
                }
            }

            setStatusMessage('Verificando dispositivos...');
            const finalAlias = localDeviceAlias.trim() || `Dispositivo ${navigator.platform || 'Web'}`;
            localStorage.setItem('pda_device_alias', finalAlias);
            localStorage.setItem('pda_explicit_login', 'true'); // Bandera para evitar que App.jsx tumba nuestra sesión antes de registrar

            const { data: rpcResult, error: rpcError } = await supabaseCloud.rpc('register_and_check_device', {
                p_email: emailToUse,
                p_device_id: deviceId || 'UNKNOWN',
                p_device_alias: finalAlias
            });
            if (rpcError) throw new Error('No se pudo validar la licencia o el dispositivo.');

            if (rpcResult === 'license_inactive') {
                throw new Error('Licencia suspendida por el administrador.');
            }
            if (rpcResult === 'license_expired') {
                throw new Error('Licencia vencida. Contacta a soporte para renovar tu acceso.');
            }
            if (rpcResult === 'limit_reached') {
                const [{ data: activeDevices, error: devicesError }, { data: licRows }] = await Promise.all([
                    supabaseCloud.rpc('get_my_devices'),
                    supabaseCloud.rpc('get_my_license_status')
                ]);
                if (devicesError) {
                    if (devicesError.code === '42883') {
                        throw new Error('Falta aplicar la migración de administración de dispositivos en Supabase.');
                    }
                    if (devicesError.code === '42501' || /401|permission denied|unauthori[sz]ed|JWT/i.test(`${devicesError.code || ''} ${devicesError.message || ''}`)) {
                        await supabaseCloud.auth.signOut().catch(() => {});
                        throw new Error('Sesión expirada. Inicia sesión nuevamente.');
                    }
                    throw devicesError;
                }
                const maxDevices = licRows?.[0]?.max_devices ?? 6;
                setBlockedDevices(activeDevices || []);
                setDeviceLimitError({ limit: maxDevices, currentId: deviceId });
                setImportStatus(null);
                setStatusMessage('');
                return;
            }

            setStatusMessage('Consultando nube...');
            const { data: cloudRow } = await supabaseCloud
                .from('cloud_backups').select('backup_data').eq('email', emailToUse).maybeSingle();
            const cloudBackup = cloudRow?.backup_data || null;
            
            const localBackup = await collectLocalBackup();
            const hasLocalData = Object.keys(localBackup.data.idb).length > 0;
            const hasCloudData = cloudBackup && cloudBackup.data;

            if (isCloudLogin && hasCloudData && hasLocalData) {
                setDataConflictPending({ email: emailToUse, cloudBackup, localBackup });
                await registerDevice(emailToUse);
                setIsCloudConfigured(true);
                setImportStatus(null);
                setStatusMessage('');
                auditLog('NUBE', 'LOGIN_NUBE', `Conflicto a resolver: ${emailToUse}`);
                return;
            }

            if (isCloudLogin && hasCloudData && !hasLocalData) {
                setStatusMessage('Restaurando nube...');
                await applyCloudBackup(cloudBackup);
                await registerDevice(emailToUse);
                localStorage.removeItem('pda_explicit_login');
                localStorage.setItem('poolbar_cloud_email', emailToUse);
                localStorage.setItem('pool_had_cloud_session', 'true');
                setIsCloudConfigured(true);
                showToast('Datos restaurados desde la nube', 'success');
                setImportStatus('success');
                setTimeout(() => window.location.reload(), 1200);
                return;
            }

            setStatusMessage('Guardando nueva cuenta...');
            if (supabaseCloud) {
                await uploadLocalBackup(emailToUse, localBackup);
                if (!isCloudLogin) {
                    const { error: licenseError } = await supabaseCloud.rpc('ensure_trial_license', {
                        p_email: emailToUse,
                        p_device_id: deviceId || 'UNKNOWN',
                        p_business_name: businessName || 'Pool Los Diaz',
                        p_phone: inputPhone || ''
                    });
                    if (licenseError) throw licenseError;
                }
                await registerDevice(emailToUse);
            }

            localStorage.removeItem('pda_explicit_login');
            localStorage.setItem('poolbar_cloud_email', emailToUse);
            localStorage.setItem('pool_had_cloud_session', 'true');
            setIsCloudConfigured(true);
            showToast('Sincronizado', 'success');
            setImportStatus(null);
            setStatusMessage('');
            setTimeout(() => window.location.reload(), 1200);

        } catch (error) {
            showToast(error.message, 'error');
            setImportStatus('error');
            setStatusMessage('');
        }
    };

    const handleResetPasswordRequest = async () => {
        setEmailError('');
        if (!inputEmail.includes('@')) { setEmailError('Correo inválido'); return; }
        
        setImportStatus('loading');
        setStatusMessage('Enviando enlace...');
        try {
            const appUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}`;
            const { error } = await supabaseCloud.auth.resetPasswordForEmail(inputEmail.toLowerCase().trim(), { redirectTo: appUrl });
            if (error) throw error;
            showToast('Enlace enviado. Revisa tu correo.', 'success');
            setIsRecoveringPassword(false);
            setImportStatus(null);
            setStatusMessage('');
        } catch (error) {
            showToast(error.message, 'error');
            setImportStatus('error');
            setStatusMessage('');
        }
    };

    return {
        inputEmail, setInputEmail,
        inputPassword, setInputPassword,
        inputPhone, setInputPhone,
        isCloudConfigured,
        isCloudLogin, setIsCloudLogin,
        emailError, setEmailError,
        passwordError, setPasswordError,
        isRecoveringPassword, setIsRecoveringPassword,
        deviceLimitError, setDeviceLimitError,
        blockedDevices, setBlockedDevices,
        dataConflictPending, setDataConflictPending,
        importStatus, setImportStatus,
        statusMessage, setStatusMessage,
        localDeviceAlias, setLocalDeviceAlias,
        handleDataConflictChoice,
        handleUnlinkSpecificDevice,
        handleUnlinkAllOtherDevices,
        handleSaveCloudAccount,
        handleResetPasswordRequest
    };
}
