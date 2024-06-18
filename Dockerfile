FROM denoland/deno:1.41.2

# The port that your application listens to.
EXPOSE 1993

WORKDIR /app

# Prefer not to run as root.
USER deno

# Cache the dependencies as a layer (the following two steps are re-run only when deps.ts is modified).
# Ideally cache deps.ts will download and compile _all_ external files used in main.ts.
COPY supabase supabase
RUN deno cache supabase/**

CMD ["run", "--allow-net", "--unstable", "supabase/functions/fetch-net-records/index.ts"]