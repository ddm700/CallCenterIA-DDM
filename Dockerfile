FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_N8N_WEBHOOK_VAPI
ARG VITE_N8N_WEBHOOK_WHATSAPP
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_N8N_WEBHOOK_VAPI=$VITE_N8N_WEBHOOK_VAPI
ENV VITE_N8N_WEBHOOK_WHATSAPP=$VITE_N8N_WEBHOOK_WHATSAPP
RUN npm run build

FROM node:20-alpine AS backend-build
WORKDIR /app
COPY backend/package*.json ./backend/
RUN npm --prefix backend ci
COPY backend ./backend
RUN npm --prefix backend run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
COPY backend/package*.json ./backend/
RUN npm --prefix backend ci --omit=dev
COPY --from=backend-build /app/backend/dist ./backend/dist
COPY --from=frontend-build /app/dist ./backend/public
EXPOSE 4000
CMD ["node", "backend/dist/server.js"]
