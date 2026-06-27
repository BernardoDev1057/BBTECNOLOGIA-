const tbody = document.getElementById("dadosVersao");

let inicio = Date.now();

async function carregarVersao(){

    try{

        const resposta = await fetch("version.json");
        const versao = await resposta.json();

        const navegador = navigator.userAgent;

        const sistema =
            navigator.userAgentData?.platform ||
            navigator.platform ||
            "Desconhecido";

        const origem = window.location.origin;

        let firebase="Conectado";

        if(!navigator.onLine)
            firebase="Offline";

        // futuramente substituir pelas consultas reais
        let produtos="--";
        let clientes="--";
        let vendas="--";

        tbody.innerHTML=`

<tr>
<td>Versão</td>
<td><strong>${versao.version}</strong></td>
</tr>

<tr>
<td>Build</td>
<td>${versao.build}</td>
</tr>

<tr>
<td>Commit</td>
<td><code>${versao.commit}</code></td>
</tr>

<tr>
<td>Branch</td>
<td>${versao.branch}</td>
</tr>

<tr>
<td>Release</td>
<td>${versao.release}</td>
</tr>

<tr class="table-secondary">
<td colspan="2">
<strong>Ambiente</strong>
</td>
</tr>

<tr>
<td>URL</td>
<td>${origem}</td>
</tr>

<tr>
<td>Firebase</td>
<td>${firebase}</td>
</tr>

<tr>
<td>Navegador</td>
<td>${navegador}</td>
</tr>

<tr>
<td>Sistema Operacional</td>
<td>${sistema}</td>
</tr>

<tr class="table-secondary">
<td colspan="2">
<strong>Banco de Dados</strong>
</td>
</tr>

<tr>
<td>Produtos</td>
<td>${produtos}</td>
</tr>

<tr>
<td>Clientes</td>
<td>${clientes}</td>
</tr>

<tr>
<td>Vendas</td>
<td>${vendas}</td>
</tr>

<tr class="table-secondary">
<td colspan="2">
<strong>Aplicação</strong>
</td>
</tr>

<tr>
<td>Desenvolvedor</td>
<td>BB Tecnologia</td>
</tr>

<tr>
<td>Licença</td>
<td>Proprietária</td>
</tr>

<tr>
<td>Tempo Online</td>
<td id="tempo-online">00:00:00</td>
</tr>

`;

    }

    catch(e){

        tbody.innerHTML=`

<tr>

<td colspan="2" class="text-danger text-center">

Erro ao carregar informações do sistema.

</td>

</tr>

`;

    }

}

setInterval(()=>{

    const segundos=Math.floor((Date.now()-inicio)/1000);

    const h=String(Math.floor(segundos/3600)).padStart(2,"0");
    const m=String(Math.floor(segundos%3600/60)).padStart(2,"0");
    const s=String(segundos%60).padStart(2,"0");

    const tempo=document.getElementById("tempo-online");

    if(tempo)
        tempo.textContent=`${h}:${m}:${s}`;

},1000);

carregarVersao();
