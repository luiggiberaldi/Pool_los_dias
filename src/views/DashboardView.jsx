import React, { useState, useEffect, useRef, useCallback } from 'react';
import { storageService } from '../utils/storageService';
import { showToast } from '../components/Toast';
import { BarChart3, TrendingUp, Package, AlertTriangle, DollarSign, TrendingDown, ArrowUpRight, Trash2, Users, Send, Ban, ChevronDown, ChevronUp, UserPlus, Phone, FileText, Recycle, Key, Settings, LockIcon, Unlock, CheckCircle2, LogOut, Award, LineChart, ListChecks, RotateCcw } from 'lucide-react';
import { formatBs } from '../utils/calculatorUtils';
import { getPaymentLabel, PAYMENT_ICONS, getPaymentIcon, toTitleCase } from '../config/paymentMethods';
import SalesHistory from '../components/Dashboard/SalesHistory';
import SalesChart from '../components/Dashboard/SalesChart';
import ConfirmModal from '../components/ConfirmModal';
import CierreCajaWizard from '../components/Dashboard/CierreCajaWizard';
import AperturaCajaModal from '../components/Dashboard/AperturaCajaModal';
import ReporteTurnoModal from '../components/Dashboard/ReporteTurnoModal';
import OperatorDashboardPanel from '../components/Dashboard/OperatorDashboardPanel';
import { generateTicketPDF, printThermalTicket } from '../utils/ticketGenerator';
import { generateDailyClosePDF } from '../utils/dailyCloseGenerator';
import { processVoidSale } from '../utils/voidSaleProcessor';
import { useNotifications } from '../hooks/useNotifications';
import AnimatedCounter from '../components/AnimatedCounter';
import SyncStatus from '../components/SyncStatus';
import { useProductContext } from '../context/ProductContext';
import { useCart } from '../context/CartContext';
import { useSecurity } from '../hooks/useSecurity';
import { useAuthStore as useLegacyAuthStore } from '../hooks/store/useAuthStore';
import { useAuthStore } from '../hooks/store/authStore';
import { useCashStore } from '../hooks/store/cashStore';
import { useAudit } from '../hooks/useAudit';
import { supabaseCloud } from '../config/supabaseCloud';
import { useConfirm } from '../hooks/useConfirm.jsx';
import { shareSaleWhatsApp } from '../utils/dashboardActions';
import { useDashboardMetrics, getLocalISODate } from '../hooks/useDashboardMetrics';
import Skeleton from '../components/Skeleton';

const SALES_KEY = 'bodega_sales_v1';

export default function DashboardView({ rates, triggerHaptic, onNavigate, theme, toggleTheme, isActive, isDemo, demoTimeLeft }) {
    const { notifyCierrePendiente, requestPermission } = useNotifications();
    const { deviceId } = useSecurity();
    const { currentUser: usuarioActivo, role, logout: authLogout } = useAuthStore();
    const isAdmin = role === 'ADMIN';
    const cajeroAbreCaja = localStorage.getItem('cajero_puede_abrir_caja') === 'true';
    const cajeroCierraCaja = localStorage.getItem('cajero_puede_cerrar_caja') === 'true';
    const { activeCashSession, openCashSession, closeCashSession } = useCashStore();
    const requireLogin = useLegacyAuthStore(s => s.requireLogin ?? false);
    const { log: auditLog } = useAudit();
    const confirm = useConfirm();
    const [sales, setSales] = useState([]);
    const { products, setProducts, isLoadingProducts, effectiveRate: bcvRate, copEnabled, tasaCop } = useProductContext();
    const { loadCart } = useCart();
    const [customers, setCustomers] = useState([]);
    const [isLoadingLocal, setIsLoadingLocal] = useState(true);
    const isLoading = isLoadingProducts || isLoadingLocal;

    // UI state
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [voidSaleTarget, setVoidSaleTarget] = useState(null);
    const [isCashReconOpen, setIsCashReconOpen] = useState(false);
    const [ticketPendingSale, setTicketPendingSale] = useState(null);
    const [ticketClientName, setTicketClientName] = useState('');
    const [ticketClientPhone, setTicketClientPhone] = useState('');
    const [ticketClientDocument, setTicketClientDocument] = useState('');
    const [recycleOffer, setRecycleOffer] = useState(null);
    const [pullDistance, setPullDistance] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [selectedChartDate, setSelectedChartDate] = useState(null);
    const [showTopDeudas, setShowTopDeudas] = useState(false);
    const [isAperturaOpen, setIsAperturaOpen] = useState(false);
    const [isReporteTurnoOpen, setIsReporteTurnoOpen] = useState(false);
    const touchStartY = useRef(0);
    const scrollRef = useRef(null);

    // ── Métricas extraídas al hook ──
    const {
        today, todaySales, todayCashFlow, todayApertura,
        todayTotalBs, todayTotalUsd, todayItemsSold,
        todayExpenses, todayExpensesUsd, todayProfit,
        recentSales, weekData, lowStockProducts,
        totalDeudas, topProducts, topStaff,
        paymentBreakdown, salesPaymentBreakdown, todayTopProducts,
    } = useDashboardMetrics({ sales, customers, products, bcvRate, selectedChartDate });

    // ── Carga de datos ──
    useEffect(() => {
        if (!isActive) return;
        let mounted = true;
        const load = async () => {
            const [savedSales, savedCustomers] = await Promise.all([
                storageService.getItem(SALES_KEY, []),
                storageService.getItem('bodega_customers_v1', []),
            ]);
            if (mounted) {
                setSales(savedSales);
                setCustomers(savedCustomers);
                setIsLoadingLocal(false);
            }
        };
        load();
        requestPermission();
        return () => { mounted = false; };
    }, [isActive]);

    // ── Notificar cierre pendiente ──
    useEffect(() => {
        if (todaySales.length > 0) notifyCierrePendiente(todaySales.length);
    }, [todaySales.length, notifyCierrePendiente]);

    // ── Escuchar actualizaciones de la nube ──
    useEffect(() => {
        const handleCloudUpdate = async (e) => {
            const key = e.detail?.key;
            if (key === SALES_KEY) setSales(await storageService.getItem(SALES_KEY, []));
            if (key === 'bodega_customers_v1') setCustomers(await storageService.getItem('bodega_customers_v1', []));
        };
        window.addEventListener('app_storage_update', handleCloudUpdate);
        return () => window.removeEventListener('app_storage_update', handleCloudUpdate);
    }, []);

    // ── Apertura de caja ──
    const handleSaveApertura = async (data) => {
        try {
            const aperturaRecord = {
                id: `apertura_${Date.now()}`,
                tipo: 'APERTURA_CAJA',
                openingUsd: data.openingUsd,
                openingBs: data.openingBs,
                timestamp: new Date().toISOString(),
                cajaCerrada: false
            };
            const existingSales = await storageService.getItem(SALES_KEY, []);
            const updatedSales = [...existingSales, aperturaRecord];
            await storageService.setItem(SALES_KEY, updatedSales);
            setSales(updatedSales);
            await openCashSession(data.openingUsd, data.openingBs, data.cashierName || usuarioActivo?.name, role);
            auditLog('VENTA', 'APERTURA_CAJA', `Caja abierta por ${role === 'ADMIN' ? 'Administrador' : 'Cajero'}: ${usuarioActivo?.name || '—'} — Base: $${data.openingUsd} / Bs${data.openingBs}`, { role, openedBy: usuarioActivo?.name });
            setIsAperturaOpen(false);
            showToast('Turno de Caja Abierto', 'success');
            if (triggerHaptic) triggerHaptic();
        } catch (error) {
            console.error('Error al guardar apertura:', error);
            showToast('Error al abrir la caja', 'error');
        }
    };

    // ── Anular venta ──
    const handleVoidSale = (sale) => setVoidSaleTarget(sale);
    const confirmVoidSale = async () => {
        const sale = voidSaleTarget;
        if (!sale) return;
        setVoidSaleTarget(null);
        try {
            const { updatedSales, updatedProducts, updatedCustomers } = await processVoidSale(sale, sales, products);
            setSales(updatedSales);
            setProducts(updatedProducts);
            setCustomers(updatedCustomers);
            showToast('Venta anulada con éxito', 'success');
            setRecycleOffer(sale);
        } catch (error) {
            console.error('Error anulando venta:', error);
            showToast('Hubo un problema anulando la venta', 'error');
        }
    };

    const handleShareWhatsApp = (sale) => {
        const saleCustomer = sale.customerId ? customers.find(c => c.id === sale.customerId) : null;
        shareSaleWhatsApp(sale, saleCustomer, bcvRate);
    };
    const handleDownloadPDF = (sale) => { triggerHaptic(); generateTicketPDF(sale, bcvRate); };
    const handlePrintTicket = (sale) => { triggerHaptic(); printThermalTicket(sale, bcvRate); };

    // ── Registrar cliente para ticket ──
    const handleRegisterClientForTicket = async () => {
        if (!ticketClientName.trim() || !ticketPendingSale) return;
        const newCustomer = {
            id: crypto.randomUUID(),
            name: ticketClientName.trim(),
            documentId: ticketClientDocument.trim() || '',
            phone: ticketClientPhone.trim() || '',
            deuda: 0, favor: 0,
            createdAt: new Date().toISOString(),
        };
        const updatedCustomers = [...customers, newCustomer];
        setCustomers(updatedCustomers);
        await storageService.setItem('bodega_customers_v1', updatedCustomers);
        const updatedSale = { ...ticketPendingSale, customerId: newCustomer.id, customerName: newCustomer.name, customerPhone: newCustomer.phone };
        const updatedSales = sales.map(s => s.id === updatedSale.id ? updatedSale : s);
        setSales(updatedSales);
        await storageService.setItem(SALES_KEY, updatedSales);
        setTicketPendingSale(null); setTicketClientName(''); setTicketClientPhone(''); setTicketClientDocument('');
        handleShareWhatsApp(updatedSale);
    };

    // ── Cierre de caja ──
    const handleDailyClose = () => { triggerHaptic && triggerHaptic(); setIsCashReconOpen(true); };
    const handleConfirmCashRecon = async (reconData) => {
        if (todayCashFlow.length > 0 || todaySales.length > 0) {
            const allTodayForReport = sales.filter(s => {
                const saleLocalDay = s.timestamp ? getLocalISODate(new Date(s.timestamp)) : getLocalISODate(new Date());
                return saleLocalDay === today && !s.cajaCerrada && s.tipo !== 'APERTURA_CAJA';
            });
            await generateDailyClosePDF({
                sales: todayCashFlow.filter(s => s.tipo !== 'APERTURA_CAJA'),
                allSales: allTodayForReport,
                bcvRate, paymentBreakdown, topProducts: todayTopProducts,
                todayTotalUsd, todayTotalBs, todayProfit, todayItemsSold,
                reconData, apertura: todayApertura,
            });
        }
        const currentCierreId = Date.now();
        const validTipos = ['VENTA','VENTA_FIADA','COBRO_DEUDA','PAGO_PROVEEDOR','APERTURA_CAJA'];
        const updatedSales = sales.map(s =>
            !s.cajaCerrada && validTipos.includes(s.tipo || 'VENTA')
                ? { ...s, cajaCerrada: true, cierreId: currentCierreId }
                : s
        );
        await storageService.setItem(SALES_KEY, updatedSales);
        setSales(updatedSales);
        await closeCashSession(reconData, usuarioActivo?.email || 'admin');
        setIsCashReconOpen(false);
        showToast('Cierre de caja completado (Historial conservado)', 'success');
        auditLog('VENTA', 'CIERRE_CAJA', 'Cierre de caja completado');
    };

    // ── Pull-to-refresh ──
    const handleTouchStart = (e) => {
        if (scrollRef.current?.scrollTop === 0) touchStartY.current = e.touches[0].clientY;
    };
    const handleTouchMove = (e) => {
        if (scrollRef.current?.scrollTop > 0) return;
        const diff = e.touches[0].clientY - touchStartY.current;
        if (diff > 0) setPullDistance(Math.min(diff * 0.4, 80));
    };
    const handleTouchEnd = async () => {
        if (pullDistance > 60) {
            setIsRefreshing(true);
            const [savedSales, savedProducts, savedCustomers] = await Promise.all([
                storageService.getItem(SALES_KEY, []),
                storageService.getItem('bodega_products_v1', []),
                storageService.getItem('bodega_customers_v1', []),
            ]);
            setSales(savedSales); setProducts(savedProducts); setCustomers(savedCustomers);
            setIsRefreshing(false);
        }
        setPullDistance(0);
    };

    if (isLoading) {
        return (
            <div className="flex-1 p-3 sm:p-4 md:p-6 lg:p-8 space-y-4">
                <Skeleton className="h-14 w-40 rounded-2xl" />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-24 rounded-2xl" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Skeleton className="h-32 rounded-3xl" /><Skeleton className="h-32 rounded-3xl" />
                </div>
                <Skeleton className="h-48 rounded-3xl" /><Skeleton className="h-24 rounded-2xl" />
            </div>
        );
    }

    const fmtCop = (v) => v.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    return (
        <div ref={scrollRef} className="flex flex-col h-full bg-[#F8FAFC] overflow-y-auto scrollbar-hide"
            onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>

            {/* Pull-to-refresh indicator */}
            {(pullDistance > 0 || isRefreshing) && (
                <div className="flex justify-center pb-3 transition-all" style={{ height: pullDistance > 0 ? pullDistance : 40 }}>
                    <div className={`w-6 h-6 rounded-full border-2 border-slate-200 border-t-[#0EA5E9] ${isRefreshing || pullDistance > 60 ? 'animate-spin-slow' : ''}`}
                        style={{ opacity: Math.min(pullDistance / 60, 1), transform: `rotate(${pullDistance * 4}deg)` }} />
                </div>
            )}

            {/* ── HEADER ── */}
            <div className="flex items-center justify-between px-3 sm:px-5 pt-3 sm:pt-4 pb-2 sm:pb-4 transition-all z-10 relative min-h-[120px] sm:min-h-[160px]">
                <div className="flex items-center justify-start gap-2 sm:gap-3 z-20">
                    <SyncStatus />
                    {usuarioActivo && (() => {
                        const r = usuarioActivo.role || usuarioActivo.rol;
                        const c = r === 'ADMIN' ? {bg:'bg-sky-50',border:'border-sky-100/50',ping:'bg-sky-400',dot:'bg-sky-500',text:'text-sky-800',btn:'text-sky-500 hover:bg-sky-100 hover:text-sky-700'}
                                : r === 'MESERO' ? {bg:'bg-orange-50',border:'border-orange-100/50',ping:'bg-orange-400',dot:'bg-orange-500',text:'text-orange-800',btn:'text-orange-500 hover:bg-orange-100 hover:text-orange-700'}
                                : {bg:'bg-teal-50',border:'border-teal-100/50',ping:'bg-teal-400',dot:'bg-teal-500',text:'text-teal-800',btn:'text-teal-500 hover:bg-teal-100 hover:text-teal-700'};
                        return (
                            <div className={`flex items-center gap-1.5 ${c.bg} ${c.border} border rounded-full pl-2 pr-1 sm:pl-3 sm:pr-1.5 py-1 sm:py-1.5 shadow-sm`}>
                                <div className="relative flex h-2 w-2 ml-1 sm:ml-0">
                                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${c.ping}`}></span>
                                    <span className={`relative inline-flex rounded-full h-2 w-2 ${c.dot}`}></span>
                                </div>
                                <span className={`hidden sm:block text-xs font-black sm:max-w-[120px] truncate ${c.text}`}>{usuarioActivo.name.split(' ')[0]}</span>
                                <button onClick={() => { triggerHaptic?.(); authLogout(); }} className={`p-1.5 ml-0.5 transition-all rounded-full active:scale-90 ${c.btn}`}>
                                    <LockIcon size={14} strokeWidth={2.5} />
                                </button>
                            </div>
                        );
                    })()}
                </div>
                <div className="hidden sm:flex absolute z-0 pointer-events-none inset-x-0 top-2 justify-center">
                    <img src="/logo.png" alt="Pool Los Diaz" style={{ height: '139px' }} className="w-auto object-contain select-none drop-shadow-sm pointer-events-auto transition-transform hover:scale-105 duration-300 cursor-pointer" draggable={false} />
                </div>
                <div className="flex sm:hidden absolute z-0 pointer-events-none inset-x-0 top-1 justify-center">
                    <img src="/logo.png" alt="Pool Los Diaz" style={{ height: '105px' }} className="w-auto object-contain select-none drop-shadow-sm pointer-events-auto transition-transform hover:scale-105 duration-75" draggable={false} />
                </div>
                <div className="flex items-center justify-end z-20">
                    {isAdmin && (
                        <button onClick={async () => {
                            const ok = await confirm({ title: 'Cerrar sesión', message: 'Se cerrará tu acceso a la nube.', confirmText: 'Cerrar sesión', cancelText: 'Cancelar', variant: 'logout' });
                            if (!ok) return;
                            await supabaseCloud.auth.signOut();
                            window.location.reload();
                        }} className="p-2 sm:px-4 sm:py-2 flex items-center gap-1.5 bg-rose-50 border border-rose-100 text-rose-500 rounded-full shadow-sm hover:bg-rose-100 hover:text-rose-600 active:scale-95 transition-all">
                            <LogOut size={16} strokeWidth={2.5} />
                            <span className="hidden sm:block text-xs font-bold uppercase tracking-wider">Salir</span>
                        </button>
                    )}
                </div>
            </div>

            {/* ── SCROLL CONTENT ── */}
            <div className="flex flex-col gap-3 px-3 sm:px-4 md:px-6 lg:px-8 pt-2 pb-28">

            {/* Demo Banner */}
            {isDemo && demoTimeLeft && (
                <div className="rounded-2xl p-4 relative overflow-hidden text-white flex items-center justify-between" style={{ background: 'linear-gradient(135deg, #F59E0B, #F97316)' }}>
                    <div className="absolute right-0 top-0 w-28 h-28 bg-white/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
                    <div className="flex items-center gap-3 relative z-10">
                        <div className="w-10 h-10 bg-black/20 rounded-xl flex items-center justify-center"><Key size={20} className="text-amber-100" /></div>
                        <div><h3 className="text-[12px] font-bold text-amber-50">Licencia de Prueba</h3><p className="text-lg font-black">{demoTimeLeft}</p></div>
                    </div>
                    <div className="relative z-10">
                        <button className="text-[10px] font-black bg-white/25 hover:bg-white/35 px-3 py-1.5 rounded-lg active:scale-95 transition-colors"
                            onClick={() => window.open(`https://wa.me/584124051793?text=Hola! Quiero adquirir Pool Los Diaz. ID: ${deviceId || 'N/A'}`.replace(/\s+/g, '%20'), '_blank')}>
                            ADQUIRIR
                        </button>
                    </div>
                </div>
            )}

            {isAdmin ? (
                <>
                {/* ── HERO REVENUE CARD ── */}
                <div className="relative rounded-[1.5rem] overflow-hidden" style={{ background: 'linear-gradient(135deg, #0EA5E9 0%, #06B6D4 50%, #5EEAD4 100%)' }}>
                    <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-white/10" />
                    <div className="absolute -left-8 -bottom-8 w-36 h-36 rounded-full bg-white/5" />
                    <div className="relative z-10 p-5">
                        <div className="flex items-start justify-between mb-4">
                            <span className="text-white/70 text-[10px] font-bold uppercase tracking-widest">Ingresos del día</span>
                            <span className="text-[10px] font-black uppercase tracking-wider bg-white/20 text-white px-2.5 py-1 rounded-full backdrop-blur-sm">
                                {(() => { const d = new Date(); const days = ['DOM','LUN','MAR','MIÉ','JUE','VIE','SÁB']; const months = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC']; return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`; })()}
                            </span>
                        </div>
                        <div className="flex items-end justify-between">
                            <div>
                                <div className="flex items-baseline gap-0.5">
                                    <span className="text-white/80 text-xl font-black">$</span>
                                    <span className="text-[2.6rem] font-black text-white tracking-tight leading-none"><AnimatedCounter value={todayTotalUsd} /></span>
                                </div>
                                <p className="text-white/60 text-xs font-semibold mt-1.5">{formatBs(todayTotalBs)} Bs</p>
                            </div>
                            <div className="text-right">
                                <div className="bg-white/20 backdrop-blur-sm rounded-2xl px-4 py-2.5 mb-1.5">
                                    <p className="text-2xl font-black text-white leading-none"><AnimatedCounter value={todaySales.length} /></p>
                                    <p className="text-white/70 text-[10px] font-bold mt-0.5">{todaySales.length === 1 ? 'VENTA' : 'VENTAS'}</p>
                                </div>
                                <p className="text-white/60 text-[10px] font-semibold"><AnimatedCounter value={todayItemsSold} /> artículos</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── KPIs ROW ── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm relative overflow-hidden">
                        <div className="absolute -right-3 -top-3 w-14 h-14 bg-emerald-50 rounded-full blur-xl" />
                        <div className="relative z-10">
                            <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center mb-2.5"><TrendingUp size={18} className="text-emerald-600" strokeWidth={2.5} /></div>
                            <p className={`text-xl font-black leading-none ${todayProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{todayProfit >= 0 ? '+' : ''}${bcvRate > 0 ? (todayProfit / bcvRate).toFixed(2) : '0.00'}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">{formatBs(todayProfit)} Bs</p>
                            <p className="text-[10px] text-slate-400 mt-1.5 font-medium">Ganancia est.</p>
                        </div>
                    </div>
                    <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm relative overflow-hidden">
                        <div className="absolute -right-3 -top-3 w-14 h-14 bg-sky-50 rounded-full blur-xl" />
                        <div className="relative z-10">
                            <div className="w-9 h-9 bg-sky-100 rounded-xl flex items-center justify-center mb-2.5"><ArrowUpRight size={18} className="text-sky-600" strokeWidth={2.5} /></div>
                            <p className="text-xl font-black text-slate-800 leading-none">{formatBs(bcvRate)}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">Bs por dólar</p>
                            <p className="text-[10px] text-sky-500 mt-1.5 font-bold uppercase tracking-wider">Tasa BCV</p>
                        </div>
                    </div>
                </div>
                </>
            ) : (
                <OperatorDashboardPanel onNavigate={onNavigate} />
            )}

            {/* ── ACCIONES RÁPIDAS ── */}
            {role !== 'MESERO' && (
            <div className={`bg-white rounded-2xl p-3 border border-slate-100 shadow-sm ${!isAdmin ? 'mt-3' : ''}`}>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5 px-1">Acciones Rápidas</p>
                <div className="flex gap-2">
                    {isAdmin && (
                        <button onClick={() => { if (onNavigate) { triggerHaptic(); onNavigate('mesas'); } }}
                            className="flex-1 flex flex-col items-center gap-1.5 py-3.5 rounded-xl active:scale-95 transition-all"
                            style={{ background: 'linear-gradient(135deg, #0EA5E9, #0284C7)', boxShadow: '0 4px 12px rgba(14,165,233,0.25)' }}>
                            <ListChecks size={22} className="text-white" />
                            <span className="text-[11px] font-black text-white">Mesas</span>
                        </button>
                    )}
                    {isAdmin && (
                        <button onClick={() => { if (onNavigate) { triggerHaptic(); onNavigate('reportes'); } }}
                            className="flex-1 flex flex-col items-center gap-1.5 py-3.5 rounded-xl active:scale-95 transition-all"
                            style={{ background: 'linear-gradient(135deg, #334155, #1E293B)', boxShadow: '0 4px 12px rgba(51,65,85,0.15)' }}>
                            <LineChart size={22} className="text-white" />
                            <span className="text-[11px] font-black text-white">Reportes</span>
                        </button>
                    )}
                    {role !== 'MESERO' && (
                        <button onClick={() => { if (onNavigate) { triggerHaptic(); onNavigate('clientes'); } }}
                            className="flex-1 flex flex-col items-center gap-1.5 py-3.5 rounded-xl active:scale-95 transition-all"
                            style={{ background: 'linear-gradient(135deg, #10B981, #059669)', boxShadow: '0 4px 12px rgba(16,185,129,0.2)' }}>
                            <Users size={22} className="text-white" />
                            <span className="text-[11px] font-black text-white">Clientes</span>
                        </button>
                    )}
                </div>
            </div>
            )}
            {todayExpensesUsd > 0 && (
                <div className="bg-white rounded-2xl p-4 border border-orange-100 shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center"><Package size={18} className="text-orange-500" /></div>
                        <div>
                            <p className="text-[10px] font-bold text-orange-400 uppercase tracking-wider">Egresos del día</p>
                            <p className="text-lg font-black text-orange-600">-$<AnimatedCounter value={todayExpensesUsd} /></p>
                        </div>
                    </div>
                    <span className="text-xs font-bold text-orange-500 bg-orange-50 px-2.5 py-1 rounded-lg">{todayExpenses.length} {todayExpenses.length === 1 ? 'pago' : 'pagos'}</span>
                </div>
            )}

            {/* ── CERRAR / ABRIR CAJA ── */}
            {(isAdmin || cajeroAbreCaja) ? (
                !activeCashSession ? (
                    <button onClick={() => setIsAperturaOpen(true)}
                        className="w-full rounded-2xl p-4 flex items-center justify-between active:scale-[0.98] transition-all group mt-2"
                        style={{ background: 'linear-gradient(135deg, #10B981, #059669)', boxShadow: '0 6px 20px rgba(5,150,105,0.25)' }}>
                        <div className="flex items-center gap-3">
                            <div className="w-11 h-11 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm"><Unlock size={22} className="text-white" /></div>
                            <div className="text-left">
                                <p className="text-sm font-black text-white">Abrir Caja / Turno</p>
                                <p className="text-[11px] text-white/80 font-medium">Click para iniciar el día de ventas</p>
                            </div>
                        </div>
                    </button>
                ) : (
                    (isAdmin || cajeroCierraCaja) ? (
                    <button onClick={handleDailyClose}
                        className="w-full rounded-2xl p-4 flex items-center justify-between active:scale-[0.98] transition-all group mt-2"
                        style={{ background: 'linear-gradient(135deg, #F97316, #EF4444)', boxShadow: '0 6px 20px rgba(239,68,68,0.25)' }}>
                        <div className="flex items-center gap-3">
                            <div className="w-11 h-11 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm"><LockIcon size={22} className="text-white" /></div>
                            <div className="text-left">
                                <p className="text-sm font-black text-white">Cerrar Caja</p>
                                <p className="text-[11px] text-white/70 font-medium">
                                    {activeCashSession?.opened_by ? `${activeCashSession.opened_by} · ` : ''}{todaySales.length === 0 && todayCashFlow.length === 0 ? 'Sin movimientos' : `$${todayTotalUsd.toFixed(2)} · ${todaySales.length} ${todaySales.length === 1 ? 'venta' : 'ventas'}`}
                                </p>
                            </div>
                        </div>
                        <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center group-hover:translate-x-0.5 transition-transform"><ArrowUpRight size={18} className="text-white" /></div>
                    </button>
                    ) : null
                )
            ) : (!activeCashSession) && (
                <div className="w-full bg-amber-50 rounded-2xl p-4 border border-amber-200 shadow-sm flex items-center gap-3 mt-4">
                    <div className="w-11 h-11 bg-amber-100 rounded-xl flex items-center justify-center border-2 border-white shadow-sm"><LockIcon size={22} className="text-amber-500" /></div>
                    <div>
                        <p className="text-sm font-black text-slate-800">Caja Cerrada</p>
                        <p className="text-[11px] font-semibold text-slate-500">Espera que un Administrador abra el turno para operar</p>
                    </div>
                </div>
            )}

            {/* ── REPORTE DE TURNO (cajero) ── */}
            {!isAdmin && activeCashSession && (
                <button
                    onClick={() => setIsReporteTurnoOpen(true)}
                    className="w-full rounded-2xl p-4 flex items-center justify-between active:scale-[0.98] transition-all group mt-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 bg-blue-50 dark:bg-blue-900/30 rounded-xl flex items-center justify-center"><FileText size={20} className="text-blue-500" /></div>
                        <div className="text-left">
                            <p className="text-sm font-black text-slate-700 dark:text-slate-200">Reporte de Turno</p>
                            <p className="text-[11px] text-slate-400">{todaySales.length} {todaySales.length === 1 ? 'venta' : 'ventas'} · ${todayTotalUsd.toFixed(2)}</p>
                        </div>
                    </div>
                    <div className="w-9 h-9 bg-slate-100 dark:bg-slate-700 rounded-xl flex items-center justify-center group-hover:translate-x-0.5 transition-transform">
                        <ArrowUpRight size={16} className="text-slate-400" />
                    </div>
                </button>
            )}

            {/* Deudas Pendientes */}
            {totalDeudas.count > 0 && (
                <div onClick={() => { setShowTopDeudas(!showTopDeudas); triggerHaptic && triggerHaptic(); }}
                    className="bg-white rounded-2xl p-4 border border-rose-100 shadow-sm relative overflow-hidden cursor-pointer active:scale-[0.99] transition-all">
                    <div className="absolute -right-4 -top-4 w-16 h-16 bg-rose-50 rounded-full blur-2xl" />
                    <div className="flex items-center justify-between relative z-10">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center"><Users size={20} className="text-rose-500" /></div>
                            <div>
                                <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest">Deudas</p>
                                <p className="text-xl font-black text-rose-600">${totalDeudas.totalUsd.toFixed(2)}</p>
                            </div>
                        </div>
                        <div className="text-right flex items-center gap-2">
                            <div>
                                <p className="text-sm font-bold text-slate-500">{totalDeudas.count} {totalDeudas.count === 1 ? 'cliente' : 'clientes'}</p>
                                {bcvRate > 0 && <p className="text-[10px] text-slate-400">{formatBs(totalDeudas.totalUsd * bcvRate)} Bs</p>}
                            </div>
                            {showTopDeudas ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                        </div>
                    </div>
                    {showTopDeudas && (
                        <div className="mt-4 pt-3 border-t border-slate-100 space-y-2 relative z-10 animate-fade-in text-slate-700">
                            {totalDeudas.top5.map((c, i) => (
                                <div key={c.id} className="flex items-center justify-between py-1.5">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <span className="text-[10px] font-black text-rose-300 w-4 text-center shrink-0">{i + 1}</span>
                                        <div className="w-7 h-7 rounded-full bg-rose-50 flex items-center justify-center shrink-0"><span className="text-xs font-black text-rose-500">{c.name.charAt(0).toUpperCase()}</span></div>
                                        <p className="text-xs font-bold truncate">{c.name}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-sm font-black text-rose-600">${(c.deuda || 0).toFixed(2)}</p>
                                        {bcvRate > 0 && <p className="text-[9px] text-rose-400/60">{formatBs((c.deuda || 0) * bcvRate)} Bs</p>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Medios de Pago */}
            {isAdmin && Object.keys(salesPaymentBreakdown).length > 0 && (() => {
                const entries = Object.entries(salesPaymentBreakdown).filter(([, d]) => d.total > 0);
                const fiadoMethods = entries.filter(([, d]) => d.currency === 'FIADO');
                const bsMethods    = entries.filter(([, d]) => d.currency === 'BS' || (!d.currency));
                const usdMethods   = entries.filter(([, d]) => d.currency === 'USD');
                const copMethods   = entries.filter(([, d]) => d.currency === 'COP');
                const vueltoBs     = salesPaymentBreakdown['_vuelto_bs'];
                const vueltoUsd    = salesPaymentBreakdown['_vuelto_usd'];
                const subtotalBs   = bsMethods.reduce((s, [, d]) => s + d.total, 0)  + (vueltoBs?.total  || 0);
                const subtotalUsd  = usdMethods.reduce((s, [, d]) => s + d.total, 0) + (vueltoUsd?.total || 0);
                const subtotalCop  = copMethods.reduce((s, [, d]) => s + d.total, 0);
                const renderMethod = ([method, data]) => {
                    const label = toTitleCase(getPaymentLabel(method, data.label));
                    const PayIcon = getPaymentIcon(method) || PAYMENT_ICONS[method];
                    let totalBsEquiv = data.total, pct = 0, displayAmount = `${formatBs(data.total)} Bs`;
                    if (data.currency === 'FIADO') { totalBsEquiv = data.total * bcvRate; pct = todayTotalBs > 0 ? Math.min(100, totalBsEquiv / todayTotalBs * 100) : 0; displayAmount = `$ ${data.total.toFixed(2)}`; }
                    else if (data.currency === 'USD') { totalBsEquiv = data.total * bcvRate; pct = todayTotalBs > 0 ? Math.min(100, totalBsEquiv / todayTotalBs * 100) : 0; displayAmount = `$ ${data.total.toFixed(2)}`; }
                    else if (data.currency === 'COP') { totalBsEquiv = (data.total / (tasaCop || 1)) * bcvRate; pct = todayTotalBs > 0 ? Math.min(100, totalBsEquiv / todayTotalBs * 100) : 0; displayAmount = `${fmtCop(data.total)} COP`; }
                    else { pct = todayTotalBs > 0 ? Math.min(100, data.total / todayTotalBs * 100) : 0; }
                    return (
                        <div key={method} className="mb-3">
                            <div className="flex justify-between items-center mb-1.5">
                                <span className="text-slate-600 font-bold text-xs flex items-center gap-1.5">{PayIcon && <PayIcon size={14} className="text-[#0EA5E9]" />}{label}</span>
                                <div className="text-right flex items-center gap-2">
                                    <div className="flex flex-col items-end">
                                        <span className="font-black text-slate-800 text-sm">{displayAmount}</span>
                                        {data.currency === 'FIADO' && <span className="text-[9px] text-slate-400">{formatBs(totalBsEquiv)} Bs</span>}
                                    </div>
                                    <span className="text-[10px] font-black w-8 text-right text-slate-400">{pct.toFixed(0)}%</span>
                                </div>
                            </div>
                            {data.currency !== 'FIADO' && <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-[#0EA5E9] to-[#5EEAD4] rounded-full transition-all" style={{ width: `${pct}%` }} /></div>}
                        </div>
                    );
                };
                const renderVuelto = (entry, currency) => {
                    if (!entry || entry.total === 0) return null;
                    const abs = Math.abs(entry.total);
                    const display = currency === 'USD' ? `- $${abs.toFixed(2)}` : `- ${formatBs(abs)} Bs`;
                    const pct = todayTotalBs > 0 ? Math.min(100, abs * (currency === 'USD' ? bcvRate : 1) / todayTotalBs * 100) : 0;
                    return (
                        <div className="mb-3">
                            <div className="flex justify-between items-center mb-1.5">
                                <span className="text-orange-500 font-bold text-xs flex items-center gap-1.5">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="7 17 17 7"/><polyline points="7 7 7 17 17 17"/></svg>
                                    Vuelto Entregado
                                </span>
                                <div className="text-right flex items-center gap-2">
                                    <span className="font-black text-orange-500 text-sm">{display}</span>
                                    <span className="text-[10px] font-black w-8 text-right text-orange-300">{pct.toFixed(0)}%</span>
                                </div>
                            </div>
                            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-orange-400 rounded-full transition-all" style={{ width: `${pct}%` }} /></div>
                        </div>
                    );
                };
                return (
                    <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Medios de Pago</h3>
                        {fiadoMethods.length > 0 && <div className="mb-4"><div className="flex justify-between items-end mb-2 pb-1 border-b border-rose-50"><span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Por Cobrar</span><span className="text-xs font-black text-amber-600">${fiadoMethods.reduce((s, [,d]) => s + d.total, 0).toFixed(2)}</span></div><div className="pl-2 border-l-2 border-amber-200">{fiadoMethods.map(renderMethod)}</div></div>}
                        {(bsMethods.length > 0 || (bsMethods.length === 0 && vueltoBs)) && <div className="mb-4"><div className="flex justify-between items-end mb-2 pb-1 border-b border-sky-50"><span className="text-[10px] font-bold text-sky-500 uppercase tracking-wider">Bolívares</span><span className="text-xs font-black text-sky-600">{formatBs(subtotalBs)} Bs neto</span></div><div className="pl-2 border-l-2 border-sky-200">{bsMethods.map(renderMethod)}{renderVuelto(vueltoBs, 'BS')}</div></div>}
                        {usdMethods.length > 0 && <div className="mb-4"><div className="flex justify-between items-end mb-2 pb-1 border-b border-emerald-50"><span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Dólares</span><span className="text-xs font-black text-emerald-600">${subtotalUsd.toFixed(2)} neto</span></div><div className="pl-2 border-l-2 border-emerald-200">{usdMethods.map(renderMethod)}{renderVuelto(vueltoUsd, 'USD')}</div></div>}
                        {copEnabled && copMethods.length > 0 && <div><div className="flex justify-between items-end mb-2 pb-1 border-b border-amber-50"><span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Pesos</span><span className="text-xs font-black text-amber-600">{fmtCop(subtotalCop)} COP</span></div><div className="pl-2 border-l-2 border-amber-200">{copMethods.map(renderMethod)}</div></div>}
                    </div>
                );
            })()}

            {/* Gráfica semanal */}
            {isAdmin && <SalesChart weekData={weekData} selectedDate={selectedChartDate} onDayClick={(date) => { triggerHaptic(); setSelectedChartDate(prev => prev === date ? null : date); setTimeout(() => { window.scrollBy({ top: 150, behavior: 'smooth' }); }, 50); }} />}

            {/* Bajo Stock */}
            {isAdmin && lowStockProducts.length > 0 && (
                <div className="bg-white rounded-2xl p-4 border border-amber-100 shadow-sm">
                    <h3 className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><AlertTriangle size={14} /> Bajo Stock</h3>
                    <div className="flex flex-wrap gap-2">
                        {lowStockProducts.map(p => (
                            <div key={p.id} className="flex items-center gap-2 bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl">
                                <span className={`w-2 h-2 rounded-full ${(p.stock ?? 0) === 0 ? 'bg-red-500' : 'bg-amber-400'}`} />
                                <span className="text-xs font-bold text-slate-700 truncate max-w-[120px]">{p.name}</span>
                                <span className="text-[10px] font-black text-slate-400 ml-1">{p.stock ?? 0} {p.unit === 'kg' ? 'kg' : p.unit === 'litro' ? 'lt' : 'u'}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Top Productos */}
            {isAdmin && topProducts.length > 0 && (
                <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-1.5"><TrendingUp size={14} /> Más Vendidos</h3>
                    <div className="space-y-3">
                        {topProducts.map((p, i) => (
                            <div key={p.name} className="flex items-center justify-between">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className={`text-[10px] font-black w-4 text-center shrink-0 ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-orange-400' : 'text-slate-300'}`}>{i + 1}</span>
                                    <p className="text-xs font-bold text-slate-700 truncate">{p.name}</p>
                                </div>
                                <span className="text-xs font-black text-[#0EA5E9] shrink-0 pl-2">{p.qty} u</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}


            {/* Top Meseros — visible para admin con botón reiniciar */}
            {isAdmin && (
                <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-[10px] font-bold text-orange-500 uppercase tracking-widest flex items-center gap-1.5"><Award size={14} /> Ranking Meseros</h3>
                        {topStaff.length > 0 && (
                            <button onClick={async () => {
                                const ok = await confirm({ title: 'Reiniciar ranking', message: '¿Reiniciar el ranking de meseros? El conteo empezará desde cero.', confirmText: 'Reiniciar', variant: 'danger' });
                                if (!ok) return;
                                localStorage.setItem('ranking_meseros_since', new Date().toISOString());
                                window.location.reload();
                            }}
                                className="text-[10px] font-bold text-slate-400 hover:text-red-500 flex items-center gap-1 transition-colors active:scale-95">
                                <RotateCcw size={10} /> Reiniciar
                            </button>
                        )}
                    </div>
                    {topStaff.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-4 gap-1.5">
                            <Users size={24} className="text-slate-200" />
                            <p className="text-xs text-slate-400 text-center">Aún no hay ventas de meseros registradas.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {topStaff.map((s, i) => {
                                const maxRevenue = topStaff[0]?.revenue || 1;
                                const pct = Math.round((s.revenue / maxRevenue) * 100);
                                return (
                                    <div key={s.id}>
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <span className={`text-sm font-black w-5 text-center shrink-0 ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-orange-400' : 'text-slate-300'}`}>
                                                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                                                </span>
                                                <div className="min-w-0">
                                                    <p className="text-xs font-bold text-slate-700 truncate">{s.name}</p>
                                                    <p className="text-[10px] text-slate-400">{s.ventas} {s.ventas === 1 ? 'venta' : 'ventas'}</p>
                                                </div>
                                            </div>
                                            <span className="text-sm font-black text-emerald-600 shrink-0 pl-2">${s.revenue.toFixed(2)}</span>
                                        </div>
                                        <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                                            <div className={`h-1 rounded-full ${i === 0 ? 'bg-amber-400' : i === 1 ? 'bg-slate-300' : i === 2 ? 'bg-orange-300' : 'bg-orange-200'}`} style={{ width: `${pct}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {isAdmin && (
                <SalesHistory sales={sales} recentSales={recentSales} bcvRate={bcvRate} totalSalesCount={sales.length} isAdmin={isAdmin}
                    onVoidSale={handleVoidSale} onShareWhatsApp={handleShareWhatsApp} onDownloadPDF={handleDownloadPDF}
                    onOpenDeleteModal={() => setIsDeleteModalOpen(true)}
                    onRequestClientForTicket={(sale) => { triggerHaptic && triggerHaptic(); setTicketPendingSale(sale); }}
                    onRecycleSale={(sale) => { triggerHaptic && triggerHaptic(); loadCart(sale.items); if (onNavigate) onNavigate('ventas'); }}
                    onPrintTicket={handlePrintTicket}
                />
            )}

            {isAdmin && sales.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-300 py-10 space-y-3">
                    <BarChart3 size={64} strokeWidth={1} />
                    <p className="text-sm font-bold text-slate-500">Sin datos aún</p>
                    <p className="text-xs font-medium text-slate-400">Las estadísticas aparecerán con tu primera venta</p>
                </div>
            )}
            </div>

            {/* Modal Registrar Cliente para Ticket */}
            {ticketPendingSale && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={() => { setTicketPendingSale(null); setTicketClientName(''); setTicketClientPhone(''); setTicketClientDocument(''); }}>
                    <div className="bg-white w-full max-w-sm md:max-w-md rounded-[24px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-100" onClick={(e) => e.stopPropagation()}>
                        <div className="p-6">
                            <div className="flex justify-center mb-4"><div className="w-16 h-16 bg-[#0EA5E9]/10 text-[#0EA5E9] rounded-full flex items-center justify-center"><UserPlus size={28} /></div></div>
                            <h3 className="text-lg font-black text-center text-slate-800 mb-1">Registrar Cliente</h3>
                            <p className="text-xs text-center text-slate-500 mb-5">Para enviar el ticket, registra los datos del cliente.</p>
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Nombre del Cliente *</label>
                                    <input type="text" value={ticketClientName} onChange={(e) => setTicketClientName(e.target.value)} placeholder="Ej: María García" autoFocus className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand transition-all" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Cédula / RIF (Opcional)</label>
                                    <input type="text" value={ticketClientDocument} onChange={(e) => setTicketClientDocument(e.target.value.toUpperCase())} placeholder="Ej: V-12345678" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-brand/50 transition-all uppercase" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 flex items-center gap-1"><Phone size={10} /> Teléfono / WhatsApp</label>
                                    <input type="tel" value={ticketClientPhone} onChange={(e) => setTicketClientPhone(e.target.value)} placeholder="Ej: 0414-1234567" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-brand/50 transition-all" />
                                </div>
                            </div>
                        </div>
                        <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-3">
                            <button onClick={() => { setTicketPendingSale(null); setTicketClientName(''); setTicketClientPhone(''); setTicketClientDocument(''); }} className="flex-1 py-3 bg-white border-2 border-slate-200 text-slate-700 font-bold rounded-xl active:scale-[0.98] transition-all">Cancelar</button>
                            <button onClick={handleRegisterClientForTicket} disabled={!ticketClientName.trim()} className="flex-1 py-3 bg-brand disabled:bg-slate-300 text-white font-bold rounded-xl active:scale-[0.98] transition-all flex justify-center items-center gap-2 shadow-md shadow-brand/20"><Send size={16} /> Registrar y Enviar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Borrar Historial */}
            {isDeleteModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white w-full max-w-sm rounded-[24px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-100">
                        <div className="p-6 flex flex-col items-center text-center">
                            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4"><Trash2 size={32} /></div>
                            <h3 className="text-xl font-black text-slate-800 mb-2">¿Estás absolutamente seguro?</h3>
                            <p className="text-sm text-slate-500 mb-4 px-2">Esta acción borrará permanentemente <strong className="text-red-500">TODO el historial de ventas y reportes estadísticos</strong>. (No afectará tu inventario de productos).</p>
                            <div className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200 mb-2 mt-2">
                                <p className="text-xs font-bold text-slate-600 mb-2 uppercase tracking-wide">Escribe "BORRAR" para confirmar:</p>
                                <input type="text" value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder="Ej. BORRAR" className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-center font-black text-red-500 uppercase tracking-widest focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all outline-none" />
                            </div>
                        </div>
                        <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-3">
                            <button onClick={() => { setIsDeleteModalOpen(false); setDeleteConfirmText(''); }} className="flex-1 py-3.5 bg-white border-2 border-slate-200 text-slate-700 font-bold rounded-xl active:scale-[0.98] transition-all">Cancelar</button>
                            <button onClick={async () => {
                                if (deleteConfirmText.trim().toUpperCase() === 'BORRAR') {
                                    setSales([]);
                                    await storageService.removeItem(SALES_KEY);
                                    localStorage.removeItem('cierre_notified_date');
                                    try {
                                        const { data: { session } } = await supabaseCloud.auth.getSession();
                                        if (session?.user?.id) await supabaseCloud.from('sync_documents').delete().eq('user_id', session.user.id).eq('doc_id', SALES_KEY);
                                    } catch { /* sin nube */ }
                                    setIsDeleteModalOpen(false); setDeleteConfirmText('');
                                    showToast('Historial y reportes eliminados', 'success');
                                    setTimeout(() => window.location.reload(), 800);
                                }
                            }} disabled={deleteConfirmText.trim().toUpperCase() !== 'BORRAR'} className="flex-1 py-3.5 bg-red-500 disabled:bg-slate-300 disabled:text-slate-500 text-white font-bold rounded-xl active:scale-[0.98] transition-all flex justify-center items-center gap-2"><Trash2 size={18} /> Borrar Historial</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Reciclar Venta */}
            {recycleOffer && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setRecycleOffer(null)}>
                    <div className="bg-white w-full max-w-sm rounded-[24px] shadow-xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                        <div className="p-6 text-center">
                            <div className="flex justify-center mb-4"><div className="w-16 h-16 bg-[#0EA5E9]/10 text-[#0EA5E9] rounded-full flex items-center justify-center"><Recycle size={28} /></div></div>
                            <h3 className="text-xl font-black text-slate-800 mb-2">¿Reciclar Venta?</h3>
                            <p className="text-sm text-slate-500 mb-6">¿Quieres copiar los productos de esta venta anulada a tu caja actual?</p>
                            <div className="text-left bg-slate-50 border border-slate-100 rounded-xl p-3 mb-2">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">Productos a reciclar</p>
                                <div className="space-y-1.5 max-h-32 overflow-y-auto scrollbar-hide pr-1">
                                    {recycleOffer.items?.slice(0, 5).map((item, i) => (
                                        <div key={i} className="flex justify-between text-xs bg-white border border-slate-100 p-2 rounded-lg items-center">
                                            <span className="font-bold text-slate-700 truncate pr-2 mr-2">{item.qty}{item.isWeight ? 'kg' : 'u'} {item.name}</span>
                                            <span className="text-slate-500 font-medium shrink-0">${(item.priceUsd * item.qty).toFixed(2)}</span>
                                        </div>
                                    ))}
                                </div>
                                {recycleOffer.items?.length > 5 && <p className="text-[10px] text-slate-400 text-center font-bold mt-2">+{recycleOffer.items.length - 5} productos más...</p>}
                            </div>
                        </div>
                        <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-3">
                            <button onClick={() => setRecycleOffer(null)} className="flex-1 py-3 bg-white border-2 border-slate-200 text-slate-700 font-bold rounded-xl active:scale-[0.98] transition-all">No, gracias</button>
                            <button onClick={() => { loadCart(recycleOffer.items); setRecycleOffer(null); if (onNavigate) onNavigate('ventas'); }} className="flex-1 py-3 bg-[#0EA5E9] hover:bg-[#0284C7] text-white font-bold rounded-xl active:scale-[0.98] transition-all flex justify-center items-center gap-2 shadow-md shadow-[#0EA5E9]/20"><Recycle size={16} /> Reciclar</button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmModal isOpen={!!voidSaleTarget} onClose={() => setVoidSaleTarget(null)} onConfirm={confirmVoidSale}
                title={`Anular venta #${voidSaleTarget?.id?.substring(0, 6).toUpperCase() || ''}`}
                message={`Esta acción:\n• Marcará la venta como ANULADA\n• Devolverá el stock a la bodega\n• Revertirá deudas o saldos a favor\n\nEsta acción no se puede deshacer.`}
                confirmText="Sí, anular" variant="danger" />

            <CierreCajaWizard isOpen={isCashReconOpen} onClose={() => setIsCashReconOpen(false)} onConfirm={handleConfirmCashRecon}
                todaySales={todaySales} todayTotalUsd={todayTotalUsd} todayTotalBs={todayTotalBs} todayProfit={todayProfit}
                todayItemsSold={todayItemsSold} todayExpensesUsd={todayExpensesUsd} paymentBreakdown={paymentBreakdown}
                todayTopProducts={todayTopProducts} bcvRate={bcvRate} copEnabled={copEnabled} tasaCop={tasaCop} isAdmin={isAdmin} />

            <AperturaCajaModal isOpen={isAperturaOpen} onClose={() => setIsAperturaOpen(false)} onConfirm={handleSaveApertura} />

            <ReporteTurnoModal
                isOpen={isReporteTurnoOpen}
                onClose={() => setIsReporteTurnoOpen(false)}
                todaySales={todaySales}
                todayTotalUsd={todayTotalUsd}
                todayTotalBs={todayTotalBs}
                todayItemsSold={todayItemsSold}
                paymentBreakdown={paymentBreakdown}
                activeCashSession={activeCashSession}
                cajeroName={usuarioActivo?.name}
                products={products}
            />
        </div>
    );
}
