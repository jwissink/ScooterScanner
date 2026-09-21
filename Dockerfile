# Statische ScooterScanner-pagina, geserveerd door een kleine Node-server.
# Haven draait dit als Docker-container met host-networking; HOST en PORT komen
# uit de env-file die deploy-docker-app aanmaakt.
FROM node:22-alpine

WORKDIR /app
COPY index.html server.js ./

# Defaults; op de server overschrijft de env-file deze met HOST=127.0.0.1 en de
# toegewezen PORT.
ENV HOST=127.0.0.1
ENV PORT=4105
EXPOSE 4105

# Draai als de meegeleverde niet-root gebruiker.
USER node

CMD ["node", "server.js"]
