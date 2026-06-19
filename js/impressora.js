// js/impressora.js

export function imprimirComprovante(titulo, corpo) {
    const janela = window.open('', '_blank', 'width=350,height=600');
    
    janela.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>${titulo}</title>
            <style>
                /* Remove margens do navegador (como data, título da página e URL) */
                @page { 
                    margin: 0; 
                }
                body { 
                    font-family: 'Courier New', Courier, monospace; 
                    font-size: 12px;
                    line-height: 1.4;
                    padding: 10px; 
                    margin: 0;
                    width: 100%;
                }
                .linha { border-bottom: 1px dashed #000; margin: 8px 0; }
                h3 { text-align: center; margin: 5px 0; font-size: 14px; text-transform: uppercase; }
                p { margin: 4px 0; }
                
                /* Garante uma quebra de linha limpa em tabelas ou textos longos */
                span, p, div { word-wrap: break-word; }
            </style>
        </head>
        <body>
            <h3>${titulo}</h3>
            <div class="linha"></div>
            <div>
                ${corpo}
            </div>
            <div class="linha"></div>
            <p style="text-align:center; font-size: 10px;">Data: ${new Date().toLocaleString('pt-BR')}</p>
            
            <script>
                // Executa a impressão de forma segura após o carregamento total do DOM
                window.onload = function() {
                    window.print();
                    // Um delay curto garante que o diálogo de impressão não seja interrompido pelo close
                    setTimeout(() => { 
                        window.close(); 
                    }, 500);
                };
            </script>
        </body>
        </html>
    `);
    
    janela.document.close();
}
