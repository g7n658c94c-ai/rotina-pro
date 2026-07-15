# ROTINA PRO — Backend de Assinaturas

## O que isso resolve
Transforma o ROTINA PRO (HTML puro) num produto de assinatura mensal real,
com controle de acesso automatico via Kiwify + Supabase.

## Passo a passo pra colocar no ar

### 1. Configurar o backend
1. Copie .env.example para .env
2. Preencha SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e KIWIFY_WEBHOOK_SECRET
3. npm install
4. npm run dev (teste local)

### 2. Publicar (Railway/Render)
Depois de publicado, voce tera uma URL publica tipo https://rotina-pro-backend.up.railway.app

### 3. Configurar Webhook na Kiwify
URL: https://SEU-BACKEND/webhook/kiwify

### 4. Integrar o gate no HTML do ROTINA PRO
Use a URL do backend publicado no arquivo do gate de acesso.
