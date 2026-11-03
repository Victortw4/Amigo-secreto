# Implantação do Amigo Secreto

Este é um site estático feito com HTML, CSS e JavaScript. Abra `index.html`
diretamente no navegador ou publique os arquivos do projeto em qualquer
hospedagem estática. Não é necessário servidor, serviço de e-mail ou processo de
build.

Na seção de sorteio, a roleta anima até um resultado do sorteio salvo para o
grupo selecionado. Grupos com menos de dois participantes não podem ser
sorteados; depois da conclusão, os resultados individuais continuam disponíveis
somente pelo fluxo de e-mails.

## Dados e privacidade

- Grupos, participantes, endereços de e-mail, imagens de fundo e resultados do
  sorteio ficam no `localStorage` do navegador.
- O e-mail do participante é opcional. Para preparar uma mensagem, o organizador
  precisa cadastrar um endereço válido para aquela pessoa.
- Cada ação abre uma mensagem individual no aplicativo de e-mail padrão por
  meio de `mailto:`. O organizador deve revisar e enviar cada mensagem.
- O navegador não envia e-mails automaticamente e não consegue confirmar que
  um aplicativo abriu, que a mensagem foi enviada ou que ela foi entregue.
- Não há autenticação em uma aplicação estática. Qualquer pessoa com acesso ao
  mesmo perfil do navegador, ao armazenamento local ou às ferramentas de
  desenvolvedor pode consultar os resultados. Use somente em um dispositivo
  controlado pelo organizador; isso não oferece sigilo no nível de servidor.

O armazenamento mantém a chave existente `amigoSecretoGrupos`. Registros
anteriores sem endereço de e-mail ou sem sorteio continuam válidos; os campos
opcionais são tratados como vazios. Dados malformados não são sobrescritos
automaticamente.
