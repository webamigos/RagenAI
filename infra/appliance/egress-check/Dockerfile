# The tools `npm run appliance:egress-check` runs in containers: tcpdump on the
# sealed network's bridge, and curl for the scripted pass, which has to run on
# that network because a sealed network publishes nothing a host can reach.
#
# Built by the check itself, before the network is sealed.
FROM alpine:3.20
RUN apk add --no-cache tcpdump curl
