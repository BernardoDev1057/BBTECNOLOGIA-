// js/impressora.js

export function imprimirComprovante(titulo, corpo) {
    const janela = window.open('', '_blank', 'width=400,height=600');
    janela.document.write(`
        <html><head><title>${titulo}</title>
        <style>
            body { font-family: monospace; padding: 15px; }
            .linha { border-bottom: 1px dashed #000; margin: 10px 0; }
            h3 { text-align: center; }
            p { margin: 5px 0; }
        </style>
        </head><body>
        <h3>${titulo}</h3>
        <div class="linha"></div>
        ${corpo}
        <div class="linha"></div>
        <p style="text-align:center">Data: ${new Date().toLocaleString()}</p>
        <script>window.print();setTimeout(() => { window.close(); }, 2000);</script>
        </body></html>
    `);
    janela.document.close();
}
