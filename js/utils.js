export const $ = (id) => document.getElementById(id);

export const setText = (id, value) => {
    const el = $(id);
    if (el) el.textContent = value;
    return el;
};

export const setHTML = (id, html) => {
    const el = $(id);
    if (el) el.innerHTML = html;
    return el;
};

export const fmtMoney = (valor) => `R$ ${Number(valor || 0).toFixed(2)}`;

export const fmtDateBR = (value) => {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    return date.toLocaleString('pt-BR');
};

export const isoDate = (value = new Date()) => {
    if (value instanceof Date) return value.toISOString().split('T')[0];
    return String(value).split('T')[0];
};

export const parseFloatSafe = (value, fallback = 0) => {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
};

export const parseIntSafe = (value, fallback = 0) => {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
};

export const sanitizeDigits = (value = '') => String(value).replace(/\D/g, '');

export const formatCPF = (valor = '') => {
    const digits = sanitizeDigits(valor);
    if (!digits) return '';
    return digits
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};

export const formatPhone = (valor = '') => {
    const digits = sanitizeDigits(valor);
    if (digits.length <= 10) {
        return digits
            .replace(/(\d{2})(\d)/, '($1) $2')
            .replace(/(\d{4})(\d)/, '$1-$2');
    }
    return digits
        .replace(/(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{5})(\d)/, '$1-$2');
};
