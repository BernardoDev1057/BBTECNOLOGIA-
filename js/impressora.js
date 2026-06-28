// js/impressora.js

export function imprimirComprovante(titulo, corpo) {
  const janela = window.open("", "_blank", "width=350,height=600");

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
                     font-family: 'Arial', Courier, monospace; 
                    font-size: 15px;
                    line-height: 1.4;
                    padding: 10px; 
                    margin: 0;
                    width: 100%;
                }
                .linha { border-bottom: 1px dashed #000; margin: 8px 0; }
                h3 { text-align: center; margin: 5px 0; font-size: 15px; text-transform: uppercase; }
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
            <p style="text-align:center; font-size: 13px;">Data: ${new Date().toLocaleString("pt-BR")}</p>
            
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

export function Etiqueta(produto, tamanhoSelecionado) {
  let estilo = "";
  let conteudo = "";

  const precoTexto = `R$ ${produto.valorVenda}`;

  if (tamanhoSelecionado === "pequeno") {
    estilo = `
            @page { size: 8cm 3cm; margin: 0;}
            html, body {width: 8cm ;height: 3cm;margin:0;padding:0;}
            body{display:flex;flex-direction:column;justify-content:center;align-items:center;margin:0;}
            h3 { font-size:1.5em; margin:0; }
            h1 { font-size:2em; margin:0; }`;

    conteudo = `<h3>${produto.descricao}</h3><h1>${precoTexto}</h1>`;
  } else if (tamanhoSelecionado === "medio") {
    estilo = `
            @page { size: 10cm 3cm; margin:0; }
            html, body {width:10cm;height:3cm;margin:0;padding:0;}
            body{display:flex;flex-direction:column;justify-content:center;align-items:center;margin:0;}
            h3 { font-size:1.5em; margin:0; }
            h1 { font-size:2.5em; margin:0; }`;

    conteudo = `<h3>${produto.descricao}</h3><h1>${precoTexto}</h1>`;
  } else if (tamanhoSelecionado === "grande") {
    estilo = `
            @page { size: 10cm 13cm; margin:0; }
            html, body {width:10cm;height:13cm;margin:0;padding:0;}
            body{display:flex;flex-direction:column;justify-content:center;align-items:center;margin:0;background-color:#ff0;}
            h1{font-size:5em;background:#000;color:#fff;width:100%;margin:0;text-align:center;}
            h2{ font-size:3em; margin:10px 0; }
            h3{ font-size:2em; margin:0; }
            span{ font-size:2.8em; }`;

    conteudo = `<h1>OFERTA</h1><h2>${produto.descricao}</h2><h3>${precoTexto}</h3><span>UNIDADE</span>`;
  }

  const win = window.open("", "_blank");

  win.document.write(`
        <html>
        <head>
            <style>${estilo}</style>
        </head>
        <body>
            ${conteudo}
        </body>
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
        </html>
    `);

  win.document.close();
}
