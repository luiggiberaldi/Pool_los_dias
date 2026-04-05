import { useState, useEffect, useMemo } from 'react';
import { storageService } from '../utils/storageService';
import { getLocalISODate, getDateRange } from '../utils/dateHelpers';
import { calculateReportsData, groupSalesByCierreId } from '../utils/reportsProcessor';

const SALES_KEY = 'bodega_sales_v1';

export function useReportsData({ isActive, products, bcvRate, selectedRange, customFrom, customTo, activeTab }) {
    const [allSales, setAllSales] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (isActive === false) return;
        let mounted = true;
        const load = async () => {
            const saved = await storageService.getItem(SALES_KEY, []);
            if (mounted) {
                setAllSales(saved);
                setIsLoading(false);
            }
        };
        load();
        return () => { mounted = false; };
    }, [isActive]);

    const { from, to } = useMemo(() => {
        if (selectedRange === 'custom') {
            return {
                from: customFrom || getLocalISODate(new Date()),
                to: customTo || getLocalISODate(new Date()),
            };
        }
        return getDateRange(selectedRange);
    }, [selectedRange, customFrom, customTo]);

    const {
        salesForStats,
        salesForCashFlow,
        historySales,
        totalUsd,
        totalBs,
        totalItems,
        profit,
        paymentBreakdown,
        topProducts,
        salesByDay,
    } = useMemo(() => calculateReportsData(allSales, from, to, bcvRate, products), [allSales, from, to, bcvRate, products]);

    const groupedClosings = useMemo(() => {
        if (activeTab === 'history') {
            return groupSalesByCierreId(allSales, from, to);
        }
        return [];
    }, [allSales, from, to, activeTab]);

    const maxDayTotal = Math.max(...salesByDay.map(d => d.total), 1);

    return {
        allSales, setAllSales,
        isLoading,
        from, to,
        salesForStats, salesForCashFlow, historySales,
        totalUsd, totalBs, totalItems, profit,
        paymentBreakdown, topProducts, salesByDay,
        groupedClosings, maxDayTotal,
    };
}
