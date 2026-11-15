import com.android.apksig.ApkSigner;
import com.android.apksig.ApkVerifier;
import java.io.File;
import java.io.FileInputStream;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.cert.X509Certificate;
import java.util.Collections;
import java.util.List;

public class SignApk {
    public static void main(String[] args) throws Exception {
        String mode = args[0];
        if (mode.equals("sign")) {
            String ksPath = args[1], storePass = args[2], alias = args[3],
                   in = args[4], out = args[5];
            int minSdk = args.length > 6 ? Integer.parseInt(args[6]) : 21;

            KeyStore ks = KeyStore.getInstance("PKCS12");
            try (FileInputStream fis = new FileInputStream(ksPath)) {
                ks.load(fis, storePass.toCharArray());
            }
            PrivateKey key = (PrivateKey) ks.getKey(alias, storePass.toCharArray());
            X509Certificate cert = (X509Certificate) ks.getCertificate(alias);

            ApkSigner.SignerConfig cfg = new ApkSigner.SignerConfig.Builder(
                    "CERT", key, Collections.singletonList(cert)).build();

            new ApkSigner.Builder(Collections.singletonList(cfg))
                    .setInputApk(new File(in))
                    .setOutputApk(new File(out))
                    .setV1SigningEnabled(true)
                    .setV2SigningEnabled(true)
                    .setV3SigningEnabled(true)
                    .setMinSdkVersion(minSdk)
                    .setCreatedBy("1.0 (Android)")
                    .build()
                    .sign();
            System.out.println("SIGNED -> " + out);
            verify(out);
        } else {
            verify(args[1]);
        }
    }

    static void verify(String apk) throws Exception {
        ApkVerifier.Result r = new ApkVerifier.Builder(new File(apk)).build().verify();
        System.out.println("verified = " + r.isVerified());
        System.out.println("v1 = " + (r.isVerifiedUsingV1Scheme()) + "  v2 = " + r.isVerifiedUsingV2Scheme()
                + "  v3 = " + r.isVerifiedUsingV3Scheme() + "  v4 = " + r.isVerifiedUsingV4Scheme());
        if (!r.getErrors().isEmpty()) System.out.println("errors = " + r.getErrors());
        if (!r.getWarnings().isEmpty()) System.out.println("warnings = " + r.getWarnings());
        List<X509Certificate> certs = r.getSignerCertificates();
        for (X509Certificate c : certs) {
            System.out.println("cert subject = " + c.getSubjectX500Principal().getName());
            System.out.println("cert issuer  = " + c.getIssuerX500Principal().getName());
            System.out.println("cert serial  = " + c.getSerialNumber().toString(16));
            System.out.println("cert sigalg  = " + c.getSigAlgName() + " / " + c.getPublicKey().getAlgorithm());
        }
    }
}
