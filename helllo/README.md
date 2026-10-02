# hello

Site estático em HTML, CSS e JavaScript, pronto para deploy na Vercel. Não há dependências, build, formulário, API ou armazenamento de dados.

## Publicação

Importe esta pasta como projeto na Vercel e mantenha o preset **Other** sem comando de build; a raiz já contém `index.html`. O arquivo `vercel.json` adiciona cabeçalhos de segurança às respostas.

## Segurança e limites

Como não existe servidor de aplicação nem endpoint mutável, não há uma API local para rate limit. Limite de requisições configurado apenas no navegador seria facilmente contornável. A proteção contra tráfego abusivo deve ser configurada na camada da Vercel/DNS se o domínio precisar dessa política. O site não carrega analytics, fontes externas ou scripts de terceiros; somente a imagem de `i.pinimg.com` é remota. Os dois links externos abrem em nova aba com `noopener noreferrer`.

Se no futuro forem adicionados formulários, autenticação ou endpoints, eles precisam de rate limit no servidor e validação antes de serem publicados.

