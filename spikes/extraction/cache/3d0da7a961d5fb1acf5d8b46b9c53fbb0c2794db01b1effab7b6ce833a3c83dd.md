[![WHATWG](https://resources.whatwg.org/logo-url.svg)](https://whatwg.org/)
  
   
    
# URL

    
Living Standard — Last Updated 18 August 2026

   
   

    
     Participate:
     [GitHub whatwg/url](https://github.com/whatwg/url) ([new issue](https://github.com/whatwg/url/issues/new/choose), [open issues](https://github.com/whatwg/url/issues))
     [Chat on Matrix](https://whatwg.org/chat)
     Commits:
     [GitHub whatwg/url/commits](https://github.com/whatwg/url/commits)
     [Snapshot as of this commit](/commit-snapshots/55d6699373ba68a16ec182f34222a74ed8bc3dac/)
     Tests:
     [web-platform-tests url/](https://github.com/web-platform-tests/wpt/tree/master/url) ([ongoing work](https://github.com/web-platform-tests/wpt/labels/url))
     Translations (non-normative):
     [日本語](https://triple-underscore.github.io/URL-ja.html)
     [简体中文](https://htmlspecs.com/url/)
     [한국어](https://ko.htmlspecs.com/url/)
    
   
   

  
  

   
## Abstract

   
The URL Standard defines URLs, domains, IP addresses, the `application/x-www-form-urlencoded` format, and their API.

  
  

   
## Table of Contents

   

    1. [Goals](#goals)
1. [1 Infrastructure](#infrastructure)
     

      1. [1.1 Writing](#writing)
1. [1.2 Parsers](#parsers)
1. [1.3 Percent-encoded bytes](#percent-encoded-bytes)
1. [2 Security considerations](#security-considerations)
1. [3 Hosts (domains and IP addresses)](#hosts-(domains-and-ip-addresses))
     

      1. [3.1 Host representation](#host-representation)
1. [3.2 Host miscellaneous](#host-miscellaneous)
1. [3.3 IDNA](#idna)
1. [3.4 Host writing](#host-writing)
1. [3.5 Host parsing](#host-parsing)
1. [3.6 Host serializing](#host-serializing)
1. [3.7 Host equivalence](#host-equivalence)
1. [4 URLs](#urls)
     

      1. [4.1 URL representation](#url-representation)
1. [4.2 URL miscellaneous](#url-miscellaneous)
1. [4.3 URL writing](#url-writing)
1. [4.4 URL parsing](#url-parsing)
1. [4.5 URL serializing](#url-serializing)
1. [4.6 URL equivalence](#url-equivalence)
1. [4.7 Origin](#origin)
1. [4.8 URL rendering](#url-rendering)
       

        1. [4.8.1 Simplify non-human-readable or irrelevant components](#url-rendering-simplification)
1. [4.8.2 Elision](#url-rendering-elision)
1. [4.8.3 Internationalization and special characters](#url-rendering-i18n)
1. [5 `application/x-www-form-urlencoded`](#application/x-www-form-urlencoded)
     

      1. [5.1 `application/x-www-form-urlencoded` parsing](#urlencoded-parsing)
1. [5.2 `application/x-www-form-urlencoded` serializing](#urlencoded-serializing)
1. [5.3 Hooks](#urlencoded-hooks)
1. [6 API](#api)
     

      1. [6.1 URL class](#url-class)
1. [6.2 URLSearchParams class](#interface-urlsearchparams)
1. [6.3 URL APIs elsewhere](#url-apis-elsewhere)
1. [Acknowledgments](#acknowledgments)
1. [Intellectual property rights](#ipr)
1. [Index](#index)
     

      1. [Terms defined by this specification](#index-defined-here)
1. [Terms defined by reference](#index-defined-elsewhere)
1. [References](#references)
     

      1. [Normative References](#normative)
1. [Non-Normative References](#informative)
1. [IDL Index](#idl-index)

  
  

   
## Goals

   
The URL standard takes the following approach towards making URLs fully interoperable:

   

    - Align RFC 3986 and RFC 3987 with contemporary implementations and
 obsolete the RFCs in the process. (E.g., spaces, other "illegal" code points,
 query encoding, equality, canonicalization, are all concepts not entirely
 shared, or defined.) URL parsing needs to become as solid as HTML parsing.
 [[RFC3986]](#biblio-rfc3986)
 [[RFC3987]](#biblio-rfc3987)
- Standardize on the term URL. URI and IRI are just confusing. In
 practice a single algorithm is used for both so keeping them distinct is
 not helping anyone. URL also easily wins the
 [search result popularity contest](https://trends.google.com/trends/explore?q=url,uri).
- Supplanting [Origin of a URI [sic]](https://tools.ietf.org/html/rfc6454#section-4).
 [[RFC6454]](#biblio-rfc6454)
- Define URL’s existing JavaScript API in full detail and add
 enhancements to make it easier to work with. Add a new `[URL](#url)`
 object as well for URL manipulation without usage of HTML elements. (Useful
 for JavaScript worker environments.)
- Ensure the combination of parser, serializer, and API guarantee idempotence. For example, a
 non-failure result of a parse-then-serialize operation will not change with any further
 parse-then-serialize operations applied to it. Similarly, manipulating a non-failure result through
 the API will not change from applying any number of serialize-then-parse operations to it.

   
As the editors learn more about the subject matter the goals
might increase in scope somewhat.

   
## 1. Infrastructure

   
This specification depends on Infra. [[INFRA]](#biblio-infra)

   
Some terms used in this specification are defined in the following standards and specifications:

   

    - Encoding [[ENCODING]](#biblio-encoding)
- File API [[FILEAPI]](#biblio-fileapi)
- HTML [[HTML]](#biblio-html)
- Unicode IDNA Compatibility Processing [[UTS46]](#biblio-uts46)
- Web IDL [[WEBIDL]](#biblio-webidl)

   
---

   
To serialize an integer, represent it as the shortest possible decimal
number.

   
### 1.1. Writing

   
A validation error indicates a mismatch between input and
valid input. User agents, especially conformance checkers, are encouraged to report them somewhere.

   

    
A [validation error](#validation-error) does not mean that the parser terminates. Termination of a parser is
 always stated explicitly, e.g., through a return statement.

    
It is useful to signal [validation errors](#validation-error) as error-handling can be non-intuitive, legacy
 user agents might not implement correct error-handling, and the intent of what is written might be
 unclear to other developers.

   
   

    
     | Error type | Error description | Failure |

     | [IDNA](#idna) |
| domain-to-ASCII | [Unicode ToASCII](https://www.unicode.org/reports/tr46/#ToASCII) records an error when *CheckHyphens*,
    *UseSTD3ASCIIRules*, and *VerifyDnsLength* are all set to true. [[UTS46]](#biblio-uts46)

       
If details about [Unicode ToASCII](https://www.unicode.org/reports/tr46/#ToASCII) errors are
    recorded, user agents are encouraged to pass those along.

       

        
     
        
Hosts are [percent-decoded](#string-percent-decode) before being processed when the URL
     [is special](#is-special), which would result in the following host portion becoming
     "`exa#mple.org`" and thus triggering this error.

        
"`https://exa%23mple.org`" | Yes
(when beStrict is true, or domain is
   not an [ASCII string](https://infra.spec.whatwg.org/#ascii-string) and [Unicode ToASCII](https://www.unicode.org/reports/tr46/#ToASCII) with relaxed
   parameters also fails) |

     | [Host parsing](#host-parsing) |
| domain-percent-encoded | The input’s [host](#concept-host) to be processed as a domain contains a
    [percent-encoded byte](#percent-encoded-byte).

       
"`https://exam%70le.org`" | · |
| host-invalid-code-point | An [opaque host](#opaque-host) (in a URL that [is not special](#is-not-special)) contains a
    [forbidden host code point](#forbidden-host-code-point).

       
"`foo://exa[mple.org`" | Yes |
| IPv4-empty-part | An [IPv4 address](#concept-ipv4) ends with a U+002E (.).

       
"`https://127.0.0.1./`" | · |
| IPv4-too-few-parts | An [IPv4 address](#concept-ipv4) has fewer than 4 parts.

       
"`https://1.2.3/`" | · |
| IPv4-too-many-parts | An [IPv4 address](#concept-ipv4) has more than 4 parts.

       
"`https://1.2.3.4.5/`" | Yes |
| IPv4-non-numeric-part | An [IPv4 address](#concept-ipv4) part is not numeric.

       
"`https://test.42`" | Yes |
| IPv4-non-decimal-part | The [IPv4 address](#concept-ipv4) contains numbers expressed using hexadecimal or octal digits.

       
"`https://127.0.0x0.1`" | · |
| IPv4-out-of-range-part | An [IPv4 address](#concept-ipv4) part exceeds 255.

       
"`https://255.255.4000.1`" | Yes
(only if applicable to the last part) |
| IPv4-non-ASCII-input | An [IPv4 address](#concept-ipv4) is derived from a non-[ASCII string](https://infra.spec.whatwg.org/#ascii-string) through IDNA
    processing.

       
"`https://①.②.③.④`" | · |
| IPv6-unclosed | An [IPv6 address](#concept-ipv6) is missing the closing U+005D (]).

       
"`https://[::1`" | Yes |
| IPv6-invalid-compression | An [IPv6 address](#concept-ipv6) begins with improper compression.

       
"`https://[:1]`" | Yes |
| IPv6-too-many-pieces | An [IPv6 address](#concept-ipv6) contains more than 8 pieces.

       
"`https://[1:2:3:4:5:6:7:8:9]`" | Yes |
| IPv6-multiple-compression | An [IPv6 address](#concept-ipv6) is compressed in more than one spot.

       
"`https://[1::1::1]`" | Yes |
| IPv6-invalid-code-point | An [IPv6 address](#concept-ipv6) contains a code point that is neither an [ASCII hex digit](https://infra.spec.whatwg.org/#ascii-hex-digit)
    nor a U+003A (:). Or it unexpectedly ends.

       

        
     
        
"`https://[1:2:3!:4]`"

        
"`https://[1:2:3:]`" | Yes |
| IPv6-too-few-pieces | An uncompressed [IPv6 address](#concept-ipv6) contains fewer than 8 pieces.

       
"`https://[1:2:3]`" | Yes |
| IPv6-piece-leading-zero | An [IPv6 address](#concept-ipv6) [piece](#concept-ipv6-piece) contains a leading U+0030 (0).

       
"`https://[::01]`" | · |
| IPv4-in-IPv6-too-many-pieces | An [IPv6 address](#concept-ipv6) with [IPv4 address](#concept-ipv4) syntax: the IPv6 address has more
    than 6 pieces.

       
"`https://[1:1:1:1:1:1:1:127.0.0.1]`" | Yes |
| IPv4-in-IPv6-invalid-code-point | An [IPv6 address](#concept-ipv6) with [IPv4 address](#concept-ipv4) syntax:

       

        - An IPv4 part is empty or contains a non-[ASCII digit](https://infra.spec.whatwg.org/#ascii-digit).
- An IPv4 part contains a leading 0.
- There are too many IPv4 parts.

       

        
     
        
"`https://[ffff::.0.0.1]`"

        
"`https://[ffff::127.0.xyz.1]`"

        
"`https://[ffff::127.0xyz]`"

        
"`https://[ffff::127.00.0.1]`"

        
"`https://[ffff::127.0.0.1.2]`" | Yes |
| IPv4-in-IPv6-out-of-range-part | An [IPv6 address](#concept-ipv6) with [IPv4 address](#concept-ipv4) syntax: an IPv4 part exceeds 255.

       
"`https://[ffff::127.0.0.4000]`" | Yes |
| IPv4-in-IPv6-too-few-parts | An [IPv6 address](#concept-ipv6) with [IPv4 address](#concept-ipv4) syntax: an IPv4 address contains
    too few parts.

       
"`https://[ffff::127.0.0]`" | Yes |

     | [URL parsing](#url-parsing) |
| invalid-URL-unit | A code point is found that is not a [URL unit](#url-units).

       

        
     
        
"`https://example.org/>`"

        
"` https://example.org `"

        
"`ht
tps://example.org`"

        
"`https://example.org/%s`" | · |
| special-scheme-missing-following-solidus | The input’s scheme is not followed by "`//`".

       

        
     
        
"`file:c:/my-secret-folder`"

        
"`https:example.org`"

```
`const url = new URL("https:foo.html", "https://example.org/");`
``` | · |
| missing-scheme-non-relative-URL | The input is missing a [scheme](#concept-url-scheme), because it does not begin with an
    [ASCII alpha](https://infra.spec.whatwg.org/#ascii-alpha), and either no [base URL](#concept-base-url) was provided or the [base URL](#concept-base-url) cannot be
    used as a [base URL](#concept-base-url) because it has an [opaque path](#url-opaque-path).

       

        
     
        
Input’s [scheme](#concept-url-scheme) is missing and no [base URL](#concept-base-url) is given:

```
`const url = new URL("💩");`
```

        
Input’s [scheme](#concept-url-scheme) is missing, but the [base URL](#concept-base-url) has an
     [opaque path](#url-opaque-path).

```
`const url = new URL("💩", "mailto:user@example.org");`
``` | Yes |
| invalid-reverse-solidus | The URL has a [special scheme](#special-scheme) and it uses U+005C (\) instead of U+002F (/).

       
"`https://example.org\path\to\file`" | · |
| invalid-credentials | The input [includes credentials](#include-credentials).

       

        
     
        
"`https://user@example.org`"

        
"`ssh://user@example.org`" | · |
| host-missing | The input has a [special scheme](#special-scheme), but does not contain a [host](#concept-host).

       

        
     
        
"`https://#fragment`"

        
"`https://:443`"

        
"`https://user:pass@`" | Yes |
| port-out-of-range | The input’s port is too big.

       
"`https://example.org:70000`" | Yes |
| port-invalid | The input’s port is invalid.

       
"`https://example.org:7z`" | Yes |
| file-invalid-Windows-drive-letter | The input is a [relative-URL string](#relative-url-string) that [starts with a Windows drive letter](#start-with-a-windows-drive-letter) and
    the [base URL](#concept-base-url)’s [scheme](#concept-url-scheme) is "`file`".

```
`const url = new URL("/c:/path/to/file", "file:///c:/");`
``` | · |
| file-invalid-Windows-drive-letter-host | A `file:` URL’s host is a Windows drive letter.

       
"`file://c:`" | · |

   
### 1.2. Parsers

   
The EOF code point is a conceptual code point that signifies the end of a string or
code point stream.

   
A pointer for a [string](https://infra.spec.whatwg.org/#string) input is an integer that points to a
[code point](https://infra.spec.whatwg.org/#code-point) within input. Initially it points to the start of
input. If it is −1 it points nowhere. If it is greater than or equal to
input’s [code point length](https://infra.spec.whatwg.org/#string-code-point-length), it points to the [EOF code point](#eof-code-point).

   
When a [pointer](#pointer) is used, c references the [code point](https://infra.spec.whatwg.org/#code-point) the
[pointer](#pointer) points to as long as it does not point nowhere. When the [pointer](#pointer) points to
nowhere [c](#c) cannot be used.

   
When a [pointer](#pointer) is used, remaining references the
[code point substring](https://infra.spec.whatwg.org/#code-point-substring-to-the-end-of-the-string) from the
[pointer](#pointer) + 1 to the end of the string, as long as [c](#c) is not the [EOF code point](#eof-code-point).
When [c](#c) is the [EOF code point](#eof-code-point) [remaining](#remaining) cannot be used.

   
If "`mailto:username@example`" is a [string](https://infra.spec.whatwg.org/#string)
being processed and a [pointer](#pointer) points to @, [c](#c) is U+0040 (@) and [remaining](#remaining) is
"`example`".

   
If the empty string is being processed and a [pointer](#pointer)
points to the start and is then decreased by 1, using [c](#c) or [remaining](#remaining) would be an
error.

   
### 1.3. Percent-encoded bytes

   
A percent-encoded byte is a string consisting of U+0025 (%) followed by two
[ASCII hex digits](https://infra.spec.whatwg.org/#ascii-hex-digit).

   
It is generally a good idea for sequences of [percent-encoded bytes](#percent-encoded-byte) to be such
that, when [percent-decoded](#string-percent-decode) and then passed to
[UTF-8 decode without BOM or fail](https://encoding.spec.whatwg.org/#utf-8-decode-without-bom-or-fail), they do not end up as failure. How important this is
depends on where the [percent-encoded bytes](#percent-encoded-byte) are used. E.g., for the [host parser](#concept-host-parser) not
following this advice is fatal, whereas for [URL rendering](#url-rendering-i18n) the
[percent-encoded bytes](#percent-encoded-byte) would not be rendered [percent-decoded](#string-percent-decode).

   

    
To percent-encode a [byte](https://infra.spec.whatwg.org/#byte) byte,
return a [string](https://infra.spec.whatwg.org/#string) consisting of U+0025 (%), followed by two [ASCII upper hex digits](https://infra.spec.whatwg.org/#ascii-upper-hex-digit)
representing byte.

   
   

    
To percent-decode a
[byte sequence](https://infra.spec.whatwg.org/#byte-sequence) input, run these steps:

    
Using anything but [UTF-8 decode without BOM](https://encoding.spec.whatwg.org/#utf-8-decode-without-bom) when input contains
bytes that are not [ASCII bytes](https://infra.spec.whatwg.org/#ascii-byte) might be insecure and is not recommended.

    

     1. Let output be an empty [byte sequence](https://infra.spec.whatwg.org/#byte-sequence).
1. For each byte byte in input:

      

       1. If byte is not 0x25 (%), then append byte to output.
1. Otherwise, if byte is 0x25 (%) and the next two bytes after
   byte in input are not in the ranges 0x30 (0) to 0x39 (9),
   0x41 (A) to 0x46 (F), and 0x61 (a) to 0x66 (f), all inclusive, append byte to
   output.
1. Otherwise:

        

         1. Let bytePoint be the two bytes after byte in input,
     [decoded](https://infra.spec.whatwg.org/#isomorphic-decode), and then interpreted as a hexadecimal number.
1. Append a byte whose value is bytePoint to
     output.
1. Skip the next two bytes in input.
1. Return output.

   
   

    
To percent-decode a [scalar value string](https://infra.spec.whatwg.org/#scalar-value-string)
input:

    

     1. Let bytes be the [UTF-8 encoding](https://encoding.spec.whatwg.org/#utf-8-encode) of input.
1. Return the [percent-decoding](#percent-decode) of bytes.

    
In general, percent-encoding results in a string with more U+0025 (%) code points than
the input, and percent-decoding results in a byte sequence with less 0x25 (%) bytes than the input.

   
   
---

   
A percent-encode set is a [set](https://infra.spec.whatwg.org/#ordered-set) of [code points](https://infra.spec.whatwg.org/#code-point).

   
The C0 control percent-encode set is a
[percent-encode set](#percent-encode-set) consisting of [C0 controls](https://infra.spec.whatwg.org/#c0-control) and all [code points](https://infra.spec.whatwg.org/#code-point) greater than
U+007E (~).

   
The fragment percent-encode set is a [percent-encode set](#percent-encode-set) consisting of the
[C0 control percent-encode set](#c0-control-percent-encode-set) and U+0020 SPACE, U+0022 ("), U+003C (<), U+003E (>), and
U+0060 (`).

   
The query percent-encode set is a [percent-encode set](#percent-encode-set) consisting of the
[C0 control percent-encode set](#c0-control-percent-encode-set) and U+0020 SPACE, U+0022 ("), U+0023 (#), U+003C (<), and
U+003E (>).

   
The [query percent-encode set](#query-percent-encode-set) cannot be defined in terms of the
[fragment percent-encode set](#fragment-percent-encode-set) due to the omission of U+0060 (`).

   
The special-query percent-encode set is a [percent-encode set](#percent-encode-set) consisting of
the [query percent-encode set](#query-percent-encode-set) and U+0027 (').

   
The path percent-encode set is a [percent-encode set](#percent-encode-set)
consisting of the [query percent-encode set](#query-percent-encode-set) and U+003F (?), U+005E (^), U+0060 (`),
U+007B ({), and U+007D (}).

   
The userinfo percent-encode set is a
[percent-encode set](#percent-encode-set) consisting of the [path percent-encode set](#path-percent-encode-set) and U+002F (/),
U+003A (:), U+003B (;), U+003D (=), U+0040 (@), U+005B ([) to U+005D (]), inclusive, and U+007C (|).

   
The component percent-encode set is a [percent-encode set](#percent-encode-set) consisting of
the [userinfo percent-encode set](#userinfo-percent-encode-set) and U+0024 ($) to U+0026 (&), inclusive, U+002B (+), and
U+002C (,).

   
This is used by HTML for
`[registerProtocolHandler()](https://html.spec.whatwg.org/multipage/system-state.html#dom-navigator-registerprotocolhandler)`, and could also be used by other standards to
percent-encode data that can then be embedded in a [URL](#concept-url)’s [path](#concept-url-path),
[query](#concept-url-query), or [fragment](#concept-url-fragment); or in an [opaque host](#opaque-host). Using it with
[UTF-8 percent-encode](#string-utf-8-percent-encode) gives identical results to JavaScript’s
[`encodeURIComponent()` [sic]](https://tc39.es/ecma262/#sec-encodeuricomponent-uricomponent). [[HTML]](#biblio-html) [[ECMA-262]](#biblio-ecma-262)

   
The `application/x-www-form-urlencoded` percent-encode set is a
[percent-encode set](#percent-encode-set) consisting of the [component percent-encode set](#component-percent-encode-set) and U+0021 (!),
U+0027 (') to U+0029 RIGHT PARENTHESIS, inclusive, and U+007E (~).

   
The [`application/x-www-form-urlencoded` percent-encode set](#application-x-www-form-urlencoded-percent-encode-set) contains
all code points, except the [ASCII alphanumeric](https://infra.spec.whatwg.org/#ascii-alphanumeric), U+002A (*), U+002D (-), U+002E (.), and
U+005F (_).

   

    
To percent-encode after encoding, given an [encoding](https://encoding.spec.whatwg.org/#encoding)
encoding, [scalar value string](https://infra.spec.whatwg.org/#scalar-value-string) input, and a
[percent-encode set](#percent-encode-set) percentEncodeSet:

    

     1. [Assert](https://infra.spec.whatwg.org/#assert): encoding is [UTF-8](https://encoding.spec.whatwg.org/#utf-8) or
 percentEncodeSet is [special-query percent-encode set](#special-query-percent-encode-set) or
 [`application/x-www-form-urlencoded` percent-encode set](#application-x-www-form-urlencoded-percent-encode-set).
1. Let spaceAsPlus be true if percentEncodeSet is
 [`application/x-www-form-urlencoded` percent-encode set](#application-x-www-form-urlencoded-percent-encode-set); otherwise false.
1. Let encoder be the result of [getting an encoder](https://encoding.spec.whatwg.org/#get-an-encoder) from encoding.
1. Let inputQueue be input converted to an [I/O queue](https://encoding.spec.whatwg.org/#concept-stream).
1. Let output be the empty string.
1. Let potentialError be 0.

      
This needs to be a non-null value to initiate the subsequent while loop.
1. While potentialError is non-null:

      

       1. Let encodeOutput be an empty [I/O queue](https://encoding.spec.whatwg.org/#concept-stream).
1. Set potentialError to the result of running [encode or fail](https://encoding.spec.whatwg.org/#encode-or-fail) with
   inputQueue, encoder, and encodeOutput.
1. For each byte of encodeOutput converted to a byte sequence:

        

         1. If spaceAsPlus is true and byte is 0x20 (SP), then append
     U+002B (+) to output and [continue](https://infra.spec.whatwg.org/#iteration-continue).
1. Let isomorph be a [code point](https://infra.spec.whatwg.org/#code-point) whose [value](https://infra.spec.whatwg.org/#code-point-value)
     is byte’s [value](https://infra.spec.whatwg.org/#byte-value).
1. Assert: percentEncodeSet includes all non-[ASCII code points](https://infra.spec.whatwg.org/#ascii-code-point).
1. If isomorph is not in percentEncodeSet, then append
     isomorph to output.
1. Otherwise, [percent-encode](#percent-encode) byte and append the result to
     output.
1. If potentialError is non-null, then append "`%26%23`", followed by the
    shortest sequence of [ASCII digits](https://infra.spec.whatwg.org/#ascii-digit) representing potentialError in base
    ten, followed by "`%3B`", to output.

        
This can happen when encoding is not [UTF-8](https://encoding.spec.whatwg.org/#utf-8).
1. Return output.

    
Of the possible values for the percentEncodeSet argument only two end up
encoding U+0025 (%) and thus give “roundtripable data”: [component percent-encode set](#component-percent-encode-set) and
[`application/x-www-form-urlencoded` percent-encode set](#application-x-www-form-urlencoded-percent-encode-set). The other values for the
percentEncodeSet argument — which happen to be used by the [URL parser](#concept-url-parser) — leave
U+0025 (%) untouched and as such it needs to be
[percent-encoded](#utf-8-percent-encode) first in order to be properly
represented.

   
   

    
To UTF-8 percent-encode a
[scalar value](https://infra.spec.whatwg.org/#scalar-value) scalarValue using a percentEncodeSet, return the
result of running [percent-encode after encoding](#string-percent-encode-after-encoding) with [UTF-8](https://encoding.spec.whatwg.org/#utf-8),
scalarValue as a [string](https://infra.spec.whatwg.org/#string), and percentEncodeSet.

   
   

    
To UTF-8 percent-encode a [scalar value string](https://infra.spec.whatwg.org/#scalar-value-string)
input using a percentEncodeSet, return the result of running
[percent-encode after encoding](#string-percent-encode-after-encoding) with [UTF-8](https://encoding.spec.whatwg.org/#utf-8), input, and
percentEncodeSet.

   
   
---

   

    
 
    
Here is a summary, by way of example, of the operations defined above:

    

     
      | Operation | Input | Output |
| [Percent-encode](#percent-encode) input | 0x23 | "`%23`" |
| 0x7F | "`%7F`" |
| [Percent-decode](#percent-decode) input | ``%25%s%1G`` | ``%%s%1G`` |
| [Percent-decode](#string-percent-decode) input | "`‽%25%2E`" | 0xE2 0x80 0xBD 0x25 0x2E |
| [Percent-encode after encoding](#string-percent-encode-after-encoding) with [Shift_JIS](https://encoding.spec.whatwg.org/#shift_jis),
   input, and the [special-query percent-encode set](#special-query-percent-encode-set) | "` `" | "`%20`" |
| "`≡`" | "`%81%DF`" |
| "`‽`" | "`%26%238253%3B`" |
| [Percent-encode after encoding](#string-percent-encode-after-encoding) with [ISO-2022-JP](https://encoding.spec.whatwg.org/#iso-2022-jp), input,
   and the [special-query percent-encode set](#special-query-percent-encode-set) | "`¥`" | "`%1B(J\%1B(B`" |
| [Percent-encode after encoding](#string-percent-encode-after-encoding) with [Shift_JIS](https://encoding.spec.whatwg.org/#shift_jis), input, and
   the [`application/x-www-form-urlencoded` percent-encode set](#application-x-www-form-urlencoded-percent-encode-set) | "`1+1 ≡ 2%20‽`" | "`1%2B1+%81%DF+2%2520%26%238253%3B`" |
| [UTF-8 percent-encode](#utf-8-percent-encode) input using the
   [userinfo percent-encode set](#userinfo-percent-encode-set) | U+2261 (≡) | "`%E2%89%A1`" |
| U+203D (‽) | "`%E2%80%BD`" |
| [UTF-8 percent-encode](#string-utf-8-percent-encode) input using the
   [userinfo percent-encode set](#userinfo-percent-encode-set) | "`Say what‽`" | "`Say%20what%E2%80%BD`" |

   
   
## 2. Security considerations

   
The security of a [URL](#concept-url) is a function of its environment. Care is to be
taken when rendering, interpreting, and passing [URLs](#concept-url) around.

   
When rendering and allocating new [URLs](#concept-url) "spoofing" needs to be considered. An attack
whereby one [host](#concept-host) or [URL](#concept-url) can be confused for another. For instance,
consider how 1/l/I, m/rn/rri, 0/O, and а/a can all appear eerily similar. Or worse, consider how
U+202A LEFT-TO-RIGHT EMBEDDING and similar [code points](https://infra.spec.whatwg.org/#code-point) are invisible. [[UTR36]](#biblio-utr36)

   
When passing a [URL](#concept-url) from party A to B, both need to
carefully consider what is happening. A might end up leaking data it does not
want to leak. B might receive input it did not expect and take an action that
harms the user. In particular, B should never trust A, as at some
point [URLs](#concept-url) from A can come from untrusted sources.

   
## 3. Hosts (domains and IP addresses)

   
At a high level, a [host](#concept-host), [valid host string](#valid-host-string), [host parser](#concept-host-parser), and
[host serializer](#concept-host-serializer) relate as follows:

   

    - The [host parser](#concept-host-parser) takes an arbitrary [scalar value string](https://infra.spec.whatwg.org/#scalar-value-string) and returns either
 failure or a [host](#concept-host).
- A [host](#concept-host) can be seen as the in-memory representation.
- A [valid host string](#valid-host-string) defines what input would not trigger a [validation error](#validation-error)
 or failure when given to the [host parser](#concept-host-parser). I.e., input that would be considered conforming or
 valid.
- The [host serializer](#concept-host-serializer) takes a [host](#concept-host) and returns an [ASCII string](https://infra.spec.whatwg.org/#ascii-string). (If
 that string is then [parsed](#concept-host-parser), the result will [equal](#concept-host-equals) the
 [host](#concept-host) that was [serialized](#concept-host-serializer).)

   

    
 
    
A [parse](#concept-host-parser)-[serialize](#concept-host-serializer) roundtrip gives the
 following results, depending on the isOpaque argument to the [host parser](#concept-host-parser):

    

     
      | Input | Output (isOpaque = false) | Output (isOpaque = true) |
| `EXAMPLE.COM` | `example.com` ([domain](#concept-domain)) | `EXAMPLE.COM` ([opaque host](#opaque-host)) |
| `example%2Ecom` | `example%2Ecom` ([opaque host](#opaque-host)) |
| `faß.example` | `xn--fa-hia.example` ([domain](#concept-domain)) | `fa%C3%9F.example` ([opaque host](#opaque-host)) |
| `0` | `0.0.0.0` ([IPv4](#concept-ipv4)) | `0` ([opaque host](#opaque-host)) |
| `%30` | `%30` ([opaque host](#opaque-host)) |
| `0x` | `0x` ([opaque host](#opaque-host)) |
| `0xffffffff` | `255.255.255.255` ([IPv4](#concept-ipv4)) | `0xffffffff` ([opaque host](#opaque-host)) |
| `[0:0::1]` | `[::1]` ([IPv6](#concept-ipv6)) |
| `[0:0::1%5D` | Failure |
| `[0:0::%31]` |
| `09` | Failure | `09` ([opaque host](#opaque-host)) |
| `example.255` | `example.255` ([opaque host](#opaque-host)) |
| `example^example` | Failure |

   
   
### 3.1. Host representation

   
A host is a [domain](#concept-domain), an [IP address](#ip-address), an
[opaque host](#opaque-host), or an [empty host](#empty-host). Typically a [host](#concept-host) serves as a network
address, but it is sometimes used as opaque identifier in [URLs](#concept-url) where a network address
is not necessary.

   
A typical [URL](#concept-url) whose [host](#concept-url-host) is
an [opaque host](#opaque-host) is `git://github.com/whatwg/url.git`.

   
The RFCs referenced in the paragraphs below are for informative purposes only. They
have no influence on [host](#concept-host) writing, parsing, and serialization. Unless stated otherwise
in the sections that follow.

   
A domain is a non-empty [ASCII string](https://infra.spec.whatwg.org/#ascii-string) that identifies a
realm within a network.
[[RFC1034]](#biblio-rfc1034)

   
The domain labels of a [domain](#concept-domain) domain are
the result of [strictly splitting](https://infra.spec.whatwg.org/#strictly-split) domain on U+002E (.).

   
The `example.com` and `example.com.` [domains](#concept-domain) are
not equivalent and typically treated as distinct.

   
An IP address is an [IPv4 address](#concept-ipv4) or an [IPv6 address](#concept-ipv6).

   
An IPv4 address is a [32-bit unsigned integer](https://infra.spec.whatwg.org/#32-bit-unsigned-integer) that
identifies a network address.
[[RFC791]](#biblio-rfc791)

   
An IPv6 address is a [128-bit unsigned integer](https://infra.spec.whatwg.org/#128-bit-unsigned-integer) that
identifies a network address. This integer is composed of a [list](https://infra.spec.whatwg.org/#list) of 8
[16-bit unsigned integers](https://infra.spec.whatwg.org/#16-bit-unsigned-integer), also known as an [IPv6 address](#concept-ipv6)’s
pieces.
[[RFC4291]](#biblio-rfc4291)

   
Support for `<zone_id>` is
[intentionally omitted](https://www.w3.org/Bugs/Public/show_bug.cgi?id=27234#c2).

   
An opaque host is a non-empty [ASCII string](https://infra.spec.whatwg.org/#ascii-string) that can be used for further
processing.

   
An empty host is the empty string.

   
### 3.2. Host miscellaneous

   
A forbidden host code point is U+0000 NULL, U+0009 TAB, U+000A LF, U+000D CR,
U+0020 SPACE, U+0023 (#), U+002F (/), U+003A (:), U+003C (<), U+003E (>), U+003F (?), U+0040 (@),
U+005B ([), U+005C (\), U+005D (]), U+005E (^), or U+007C (|).

   
A forbidden domain code point is a [forbidden host code point](#forbidden-host-code-point),
a [C0 control](https://infra.spec.whatwg.org/#c0-control), U+0025 (%), or U+007F DELETE.

   

    
To obtain the public suffix of a [host](#concept-host) host,
run these steps. They return null or a [domain](#concept-domain) representing a portion of host
that is included on the Public Suffix List. [[PSL]](#biblio-psl)

    

     1. If host is not a [domain](#concept-domain), then return null.
1. Let trailingDot be "`.`" if host
 [ends with](https://infra.spec.whatwg.org/#string-ends-with) "`.`"; otherwise the empty string.
1. Let publicSuffix be the public suffix determined by running the
 [Public Suffix List algorithm](https://github.com/publicsuffix/list/wiki/Format#formal-algorithm)
 with host as domain. [[PSL]](#biblio-psl)
1. [Assert](https://infra.spec.whatwg.org/#assert): publicSuffix is an [ASCII string](https://infra.spec.whatwg.org/#ascii-string) that
 [ends with](https://infra.spec.whatwg.org/#string-ends-with) trailingDot.
1. Return publicSuffix.

   
   

    
To obtain the registrable domain of a [host](#concept-host)
host, run these steps. They return null or a [domain](#concept-domain) formed by
host’s [public suffix](#host-public-suffix) and the [domain label](#domain-label) preceding it, if
any.

    

     1. If host’s [public suffix](#host-public-suffix) is null or host’s
 [public suffix](#host-public-suffix) [equals](#concept-host-equals) host, then return null.
1. Let trailingDot be "`.`" if host
 [ends with](https://infra.spec.whatwg.org/#string-ends-with) "`.`"; otherwise the empty string.
1. Let registrableDomain be the registrable domain determined by running the
 [Public Suffix List algorithm](https://github.com/publicsuffix/list/wiki/Format#formal-algorithm)
 with host as domain. [[PSL]](#biblio-psl)
1. [Assert](https://infra.spec.whatwg.org/#assert): registrableDomain is an [ASCII string](https://infra.spec.whatwg.org/#ascii-string) that
 [ends with](https://infra.spec.whatwg.org/#string-ends-with) trailingDot.
1. Return registrableDomain.

   
   

    
 
    

     
      | Host input | Public suffix | Registrable domain |
| `com` | `com` | null |
| `example.com` | `com` | `example.com` |
| `www.example.com` | `com` | `example.com` |
| `sub.www.example.com` | `com` | `example.com` |
| `EXAMPLE.COM` | `com` | `example.com` |
| `example.com.` | `com.` | `example.com.` |
| `github.io` | `github.io` | null |
| `whatwg.github.io` | `github.io` | `whatwg.github.io` |
| `إختبار` | `xn--kgbechtv` | null |
| `example.إختبار` | `xn--kgbechtv` | `example.xn--kgbechtv` |
| `sub.example.إختبار` | `xn--kgbechtv` | `example.xn--kgbechtv` |
| `[2001:0db8:85a3:0000:0000:8a2e:0370:7334]` | null | null |

   
   
Specifications should prefer the [origin](https://html.spec.whatwg.org/multipage/browsers.html#concept-origin) concept
for security decisions. The notion of "[public suffix](#host-public-suffix)" and
"[registrable domain](#host-registrable-domain)" cannot be relied-upon to provide a hard security boundary, as
the public suffix list will diverge from client to client. Specifications which ignore this advice
are encouraged to carefully consider whether URLs' schemes ought to be incorporated into any
decisions made, i.e. whether to use the [same site](https://html.spec.whatwg.org/multipage/browsers.html#same-site) or [schemelessly same site](https://html.spec.whatwg.org/multipage/browsers.html#schemelessly-same-site)
concepts.

   
### 3.3. IDNA

   

    
The domain parser algorithm, given a
[scalar value string](https://infra.spec.whatwg.org/#scalar-value-string) domain and a boolean beStrict, runs these
steps. They return failure or a [domain](#concept-domain).

    

     1. Let strictResult be the result of running [domain parser ToASCII](#domain-parser-toascii) with
 domain and true.
1. If strictResult is a failure value, [domain-to-ASCII](#validation-error-domain-to-ascii)
 [validation error](#validation-error). This step does not return.
1. If beStrict is true:

      

       1. If strictResult is a failure value, then return failure.
1. Return strictResult.
1. Let result be null.
1. If domain is an [ASCII string](https://infra.spec.whatwg.org/#ascii-string), then set result to
  domain, [lowercased](https://infra.spec.whatwg.org/#ascii-lowercase).

      
When beStrict is false and domain is an [ASCII string](https://infra.spec.whatwg.org/#ascii-string),
  the algorithm returns domain [lowercased](https://infra.spec.whatwg.org/#ascii-lowercase) regardless of
  [Unicode ToASCII](https://www.unicode.org/reports/tr46/#ToASCII)’s outcome, due to web compatibility.
  *IgnoreInvalidPunycode* is not sufficient on its own, as Punycode can decode successfully
  yet still fail validity criteria. E.g., `xn--8i7caa` decodes to `ｗｗｗ`,
  whose code points have status "mapped". [[UTS46]](#biblio-uts46)
1. Otherwise:

      

       1. Set result to the result of running [domain parser ToASCII](#domain-parser-toascii) with
   domain and false.
1. If result is a failure value, then return failure.
1. If result is the empty string, then return failure.
1. If result contains a [forbidden domain code point](#forbidden-domain-code-point), then return failure.

      
Due to web compatibility and compatibility with non-DNS-based systems the
  [forbidden domain code points](#forbidden-domain-code-point) are a subset of those disallowed when *UseSTD3ASCIIRules*
  is true. See also [issue #397](https://github.com/whatwg/url/issues/397).
1. Return result.

    
This document and the web platform at large use
Unicode IDNA Compatibility Processing and not IDNA2008. For instance,
`☕.example` becomes `xn--53h.example` and not failure. [[UTS46]](#biblio-uts46) [[RFC5890]](#biblio-rfc5890)

   
   

    
The domain parser ToASCII algorithm, given a [scalar value string](https://infra.spec.whatwg.org/#scalar-value-string)
domain and a boolean beStrict, returns the result of running
[Unicode ToASCII](https://www.unicode.org/reports/tr46/#ToASCII) with *domain_name* set to domain,
*CheckHyphens* set to beStrict, *CheckBidi* set to true, *CheckJoiners*
set to true, *UseSTD3ASCIIRules* set to beStrict, *Transitional_Processing*
set to false, *VerifyDnsLength* set to beStrict, and *IgnoreInvalidPunycode*
set to false. [[UTS46]](#biblio-uts46)

   
   

    
The domain to Unicode algorithm, given a [domain](#concept-domain)
domain, runs these steps:

    

     1. Let result be the result of running
 [Unicode ToUnicode](https://www.unicode.org/reports/tr46/#ToUnicode) with *domain_name* set to domain,
 *CheckHyphens* set to false, *CheckBidi* set to true, *CheckJoiners* set to true,
 *UseSTD3ASCIIRules* set to false, *Transitional_Processing* set to false, and
 *IgnoreInvalidPunycode* set to false. [[UTS46]](#biblio-uts46)
1. If an error was recorded, then return domain.

      
Because domain can only result from the [host parser](#concept-host-parser), any recorded
  errors will already have been signified as [validation errors](#validation-error). Returning domain
  ensures the [domain parser](#concept-domain-to-ascii) and [domain to Unicode](#concept-domain-to-unicode) roundtrip on input such as
  `xn--8i7caa`.
1. Return result.

   
   
### 3.4. Host writing

   
A valid host string must be a [valid domain string](#valid-domain-string), a
[valid IPv4-address string](#valid-ipv4-address-string), or: U+005B ([), followed by a
[valid IPv6-address string](#valid-ipv6-address-string), followed by U+005D (]).

   
A [string](https://infra.spec.whatwg.org/#string) input is a valid domain if these steps return true:

   

    1. Let domain be the result of running [domain parser](#concept-domain-to-ascii) with input
 and true.
1. If domain is failure, then return false.
1. If running the [ends in a number checker](#ends-in-a-number-checker) on domain returns true, then
 return false.
1. Return true.

   
Ideally we define this in terms of a sequence of code points that make up a
[valid domain](#valid-domain) rather than through a whack-a-mole:
[issue 245](https://github.com/whatwg/url/issues/245).

   
A valid domain string must be a string that is a
[valid domain](#valid-domain).

   
A valid IPv4-address string must be four shortest
possible strings of [ASCII digits](https://infra.spec.whatwg.org/#ascii-digit), representing a decimal number in the range 0 to 255,
inclusive, separated from each other by U+002E (.).

   
A valid IPv6-address string must be one of the
following:

   

    - a [valid IPv6-pieces string](#valid-ipv6-pieces-string) with [effective piece length](#effective-piece-length) 8.
- a [valid IPv6-pieces-and-IPv4 string](#valid-ipv6-pieces-and-ipv4-string) with [effective piece length](#effective-piece-length) 8.
- U+003A U+003A (::), optionally preceded by a [valid IPv6-pieces string](#valid-ipv6-pieces-string), and
 optionally followed by either a [valid IPv6-pieces string](#valid-ipv6-pieces-string) or a
 [valid IPv6-pieces-and-IPv4 string](#valid-ipv6-pieces-and-ipv4-string), such that the sum of the [effective piece lengths](#effective-piece-length)
 of the preceding and following strings is at most 7.

   
A valid IPv6-pieces-and-IPv4 string is either a [valid IPv6-pieces string](#valid-ipv6-pieces-string),
followed by U+003A (:), followed by a [valid IPv4-address string](#valid-ipv4-address-string); or a
[valid IPv4-address string](#valid-ipv4-address-string) alone.

   
A valid IPv6-pieces string is one or more [valid IPv6-piece strings](#valid-ipv6-piece-string), separated
from each other by U+003A (:).

   
A valid IPv6-piece string is a shortest possible string of [ASCII hex digits](https://infra.spec.whatwg.org/#ascii-hex-digit),
representing a hexadecimal number in the range 0 to 0xFFFF, inclusive.

   
The effective piece length of a [valid IPv6-pieces string](#valid-ipv6-pieces-string) is the number of
[valid IPv6-piece strings](#valid-ipv6-piece-string) it contains. The [effective piece length](#effective-piece-length) of a
[valid IPv6-pieces-and-IPv4 string](#valid-ipv6-pieces-and-ipv4-string) is the number of [valid IPv6-piece strings](#valid-ipv6-piece-string) it
contains, plus 2.

   
This is derived from
A Recommendation for IPv6 Address Text Representation. For consistency with IPv4
leading zeros are not allowed. [[RFC5952]](#biblio-rfc5952)

   
A valid opaque-host string must be one of the following:

   

    - one or more [URL units](#url-units) excluding [forbidden host code points](#forbidden-host-code-point)
- U+005B ([), followed by a [valid IPv6-address string](#valid-ipv6-address-string), followed by U+005D (]).

   
This is not part of the definition of [valid host string](#valid-host-string) as it requires context
to be distinguished.

   
### 3.5. Host parsing

   

    
The host parser takes a
[scalar value string](https://infra.spec.whatwg.org/#scalar-value-string) input with an optional boolean isOpaque (default
false), and then runs these steps. They return failure or a [host](#concept-host).

    

     1. If input starts with U+005B ([), then:

      

       1. If input does not end with U+005D (]), [IPv6-unclosed](#ipv6-unclosed)
   [validation error](#validation-error), return failure.
1. Return the result of [IPv6 parsing](#concept-ipv6-parser) input with its
   leading U+005B ([) and trailing U+005D (]) removed.
1. If isOpaque is true, then return the result of
 [opaque-host parsing](#concept-opaque-host-parser) input.
1. Assert: input is not the empty string.
1. If input contains a [percent-encoded byte](#percent-encoded-byte),
 [domain-percent-encoded](#domain-percent-encoded) [validation error](#validation-error).
1. Let domain be the result of running [UTF-8 decode without BOM](https://encoding.spec.whatwg.org/#utf-8-decode-without-bom) on the
  [percent-decoding](#string-percent-decode) of input.

      
Alternatively [UTF-8 decode without BOM or fail](https://encoding.spec.whatwg.org/#utf-8-decode-without-bom-or-fail) can be used, coupled with an
  early return for failure, as the [domain parser](#concept-domain-to-ascii) fails on U+FFFD (�).
1. Let asciiDomain be the result of running [domain parser](#concept-domain-to-ascii) with
 domain and false.
1. If asciiDomain is failure, then return failure.
1. If asciiDomain [ends in a number](#ends-in-a-number-checker):

      

       1. If domain is not an [ASCII string](https://infra.spec.whatwg.org/#ascii-string), [IPv4-non-ASCII-input](#ipv4-non-ascii-input)
   [validation error](#validation-error).
1. Return the result of [IPv4 parsing](#concept-ipv4-parser) asciiDomain.
1. Return asciiDomain.

   
   
---

   

    
The ends in a number checker takes an [ASCII string](https://infra.spec.whatwg.org/#ascii-string) input and then
runs these steps. They return a boolean.

    

     1. Assert: input is not the empty string.
1. Let parts be the result of [strictly splitting](https://infra.spec.whatwg.org/#strictly-split) input on
 U+002E (.).
1. If the last [item](https://infra.spec.whatwg.org/#list-item) in parts is the empty string, then
 [remove](https://infra.spec.whatwg.org/#list-remove) the last [item](https://infra.spec.whatwg.org/#list-item) from parts.
1. Let last be the last [item](https://infra.spec.whatwg.org/#list-item) in parts.
1. If last is not the empty string and contains only [ASCII digits](https://infra.spec.whatwg.org/#ascii-digit), then return
  true.

      
The erroneous input "`09`" will be caught by the [IPv4 parser](#concept-ipv4-parser) at a
  later stage.
1. If parsing last as an [IPv4 number](#ipv4-number-parser) does not return
  failure, then return true.

      
This is equivalent to checking that last is "`0X`" or
  "`0x`", followed by zero or more [ASCII hex digits](https://infra.spec.whatwg.org/#ascii-hex-digit).
1. Return false.

   
   

    
The IPv4 parser takes an [ASCII string](https://infra.spec.whatwg.org/#ascii-string) input
and then runs these steps. They return failure or an [IPv4 address](#concept-ipv4).

    
The [IPv4 parser](#concept-ipv4-parser) is not to be invoked directly. Instead check that the
return value of the [host parser](#concept-host-parser) is an [IPv4 address](#concept-ipv4).

    

     1. Let parts be the result of [strictly splitting](https://infra.spec.whatwg.org/#strictly-split) input on
 U+002E (.).
1. If the last [item](https://infra.spec.whatwg.org/#list-item) in parts is the empty string, then:

      

       1. [IPv4-empty-part](#ipv4-empty-part) [validation error](#validation-error).
1. If parts’s [size](https://infra.spec.whatwg.org/#list-size) is greater than 1, then [remove](https://infra.spec.whatwg.org/#list-remove)
   the last [item](https://infra.spec.whatwg.org/#list-item) from parts.
1. If parts’s [size](https://infra.spec.whatwg.org/#list-size) is less than 4, [IPv4-too-few-parts](#ipv4-too-few-parts)
 [validation error](#validation-error).
1. If parts’s [size](https://infra.spec.whatwg.org/#list-size) is greater than 4, [IPv4-too-many-parts](#ipv4-too-many-parts)
 [validation error](#validation-error), return failure.
1. Let numbers be an empty [list](https://infra.spec.whatwg.org/#list).
1. [For each](https://infra.spec.whatwg.org/#list-iterate) part of parts:

      

       1. Let result be the result of [parsing](#ipv4-number-parser)
   part.
1. If result is failure, [IPv4-non-numeric-part](#ipv4-non-numeric-part) [validation error](#validation-error),
   return failure.
1. If result[1] is true, [IPv4-non-decimal-part](#ipv4-non-decimal-part) [validation error](#validation-error).
1. [Append](https://infra.spec.whatwg.org/#list-append) result[0] to numbers.
1. If any item in numbers is greater than 255, [IPv4-out-of-range-part](#ipv4-out-of-range-part)
 [validation error](#validation-error).
1. If any but the last [item](https://infra.spec.whatwg.org/#list-item) in numbers is greater than 255, then
 return failure.
1. If the last [item](https://infra.spec.whatwg.org/#list-item) in numbers is greater than or equal to
 256(5 − numbers’s [size](https://infra.spec.whatwg.org/#list-size)), then return failure.
1. Let ipv4 be the last [item](https://infra.spec.whatwg.org/#list-item) in numbers.
1. [Remove](https://infra.spec.whatwg.org/#list-remove) the last [item](https://infra.spec.whatwg.org/#list-item) from numbers.
1. Let counter be 0.
1. [For each](https://infra.spec.whatwg.org/#list-iterate) n of numbers:

      

       1. Increment ipv4 by n ×
   256(3 − counter).
1. Increment counter by 1.
1. Return ipv4.

   
   

    
The IPv4 number parser takes an [ASCII string](https://infra.spec.whatwg.org/#ascii-string) input and then runs
these steps. They return failure or a [tuple](https://infra.spec.whatwg.org/#tuple) of a number and a boolean.

    

     1. If input is the empty string, then return failure.
1. Let validationError be false.
1. Let R be 10.
1. If input contains at least two code points and the first two code points are either
  "`0X`" or "`0x`", then:

      

       1. Set validationError to true.
1. Remove the first two code points from input.
1. Set R to 16.
1. Otherwise, if input contains at least two code points and the first code point is
  U+0030 (0), then:

      

       1. Set validationError to true.
1. Remove the first code point from input.
1. Set R to 8.
1. If input is the empty string, then return (0, true).
1. If input contains a code point that is not a radix-R digit, then
 return failure.
1. Let output be the mathematical integer value that is represented by
 input in radix-R notation, using [ASCII hex digits](https://infra.spec.whatwg.org/#ascii-hex-digit) for digits with
 values 0 through 15.
1. Return (output, validationError).

   
   
---

   

    
The IPv6 parser takes a [scalar value string](https://infra.spec.whatwg.org/#scalar-value-string)
input and then runs these steps. They return failure or an [IPv6 address](#concept-ipv6).

    
The [IPv6 parser](#concept-ipv6-parser) could in theory be invoked directly, but please discuss
actually doing that with the editors of this document first.

    

     1. Let address be a new [IPv6 address](#concept-ipv6) whose [pieces](#concept-ipv6-piece)
 are all 0.
1. Let pieceIndex be 0.
1. Let compress be null.
1. Let pointer be a [pointer](#pointer) for input.
1. If [c](#c) is U+003A (:), then:

      

       1. If [remaining](#remaining) does not start with U+003A (:), [IPv6-invalid-compression](#ipv6-invalid-compression)
   [validation error](#validation-error), return failure.
1. Increase pointer by 2.
1. Increase pieceIndex by 1 and then set compress to
   pieceIndex.
1. While [c](#c) is not the [EOF code point](#eof-code-point):

      

       1. If pieceIndex is 8, [IPv6-too-many-pieces](#ipv6-too-many-pieces) [validation error](#validation-error), return
   failure.
1. If [c](#c) is U+003A (:), then:

        

         1. If compress is non-null, [IPv6-multiple-compression](#ipv6-multiple-compression)
     [validation error](#validation-error), return failure.
1. Increase pointer and pieceIndex by 1, set compress to
     pieceIndex, and then [continue](https://infra.spec.whatwg.org/#iteration-continue).
1. Let value and length be 0.
1. While length is less than 4 and [c](#c) is an [ASCII hex digit](https://infra.spec.whatwg.org/#ascii-hex-digit), set
   value to value × 0x10 + [c](#c) interpreted as a hexadecimal number,
   and increase pointer and length by 1.
1. If [c](#c) is U+002E (.), then:

        

         1. If length is 0, [IPv4-in-IPv6-invalid-code-point](#ipv4-in-ipv6-invalid-code-point)
     [validation error](#validation-error), return failure.
1. Decrease pointer by length.
1. If pieceIndex is greater than 6, [IPv4-in-IPv6-too-many-pieces](#ipv4-in-ipv6-too-many-pieces)
     [validation error](#validation-error), return failure.
1. Let numbersSeen be 0.
1. While [c](#c) is not the [EOF code point](#eof-code-point):

          

           1. Let ipv4Piece be null.
1. If numbersSeen is greater than 0, then:

            

             1. If [c](#c) is a U+002E (.) and numbersSeen is less than 4, then increase
         pointer by 1.
1. Otherwise, [IPv4-in-IPv6-invalid-code-point](#ipv4-in-ipv6-invalid-code-point) [validation error](#validation-error), return
         failure.
1. If [c](#c) is not an [ASCII digit](https://infra.spec.whatwg.org/#ascii-digit), [IPv4-in-IPv6-invalid-code-point](#ipv4-in-ipv6-invalid-code-point)
       [validation error](#validation-error), return failure.
1. While [c](#c) is an [ASCII digit](https://infra.spec.whatwg.org/#ascii-digit):

            

             1. Let number be [c](#c) interpreted as decimal number.
1. If ipv4Piece is null, then set ipv4Piece to number.
1. Otherwise, if ipv4Piece is 0, [IPv4-in-IPv6-invalid-code-point](#ipv4-in-ipv6-invalid-code-point)
         [validation error](#validation-error), return failure.
1. Otherwise, set ipv4Piece to ipv4Piece × 10 +
         number.
1. If ipv4Piece is greater than 255, [IPv4-in-IPv6-out-of-range-part](#ipv4-in-ipv6-out-of-range-part)
         [validation error](#validation-error), return failure.
1. Increase pointer by 1.
1. Set address[pieceIndex] to
       address[pieceIndex] × 0x100 + ipv4Piece.
1. Increase numbersSeen by 1.
1. If numbersSeen is 2 or 4, then increase pieceIndex by 1.
1. If numbersSeen is not 4, [IPv4-in-IPv6-too-few-parts](#ipv4-in-ipv6-too-few-parts)
     [validation error](#validation-error), return failure.
1. [Break](https://infra.spec.whatwg.org/#iteration-break).
1. Otherwise, if [c](#c) is U+003A (:):

        

         1. Increase pointer by 1.
1. If [c](#c) is the [EOF code point](#eof-code-point), [IPv6-invalid-code-point](#ipv6-invalid-code-point)
     [validation error](#validation-error), return failure.
1. Otherwise, if [c](#c) is not the [EOF code point](#eof-code-point), [IPv6-invalid-code-point](#ipv6-invalid-code-point)
   [validation error](#validation-error), return failure.
1. If length is greater than 1 and value is less than
   0x10length − 1, [IPv6-piece-leading-zero](#ipv6-piece-leading-zero) [validation
   error](#validation-error).
1. Set address[pieceIndex] to value.
1. Increase pieceIndex by 1.
1. If compress is non-null, then:

      

       1. Let swaps be pieceIndex − compress.
1. Set pieceIndex to 7.
1. While pieceIndex is not 0 and swaps is greater than 0, swap
   address[pieceIndex] with
   address[compress + swaps − 1], and then decrease both
   pieceIndex and swaps by 1.
1. Otherwise, if compress is null and pieceIndex is not 8,
 [IPv6-too-few-pieces](#ipv6-too-few-pieces) [validation error](#validation-error), return failure.
1. Return address.

   
   
---

   

    
The opaque-host parser takes a
[scalar value string](https://infra.spec.whatwg.org/#scalar-value-string) input, and then runs these steps. They return failure or an
[opaque host](#opaque-host).

    

     1. If input contains a [forbidden host code point](#forbidden-host-code-point),
 [host-invalid-code-point](#host-invalid-code-point) [validation error](#validation-error), return failure.
1. If input contains a [code point](https://infra.spec.whatwg.org/#code-point) that is not a [URL code point](#url-code-points) and not
 U+0025 (%), [invalid-URL-unit](#invalid-url-unit) [validation error](#validation-error).
1. If input contains a U+0025 (%) and the two [code points](https://infra.spec.whatwg.org/#code-point) following it are
 not [ASCII hex digits](https://infra.spec.whatwg.org/#ascii-hex-digit), [invalid-URL-unit](#invalid-url-unit) [validation error](#validation-error).
1. Return the result of running [UTF-8 percent-encode](#string-utf-8-percent-encode) on input
 using the [C0 control percent-encode set](#c0-control-percent-encode-set).

   
   
### 3.6. Host serializing

   

    
The host serializer takes a
[host](#concept-host) host and then runs these steps. They return an [ASCII string](https://infra.spec.whatwg.org/#ascii-string).

    

     1. If host is an [IPv4 address](#concept-ipv4), return the result of
 running the [IPv4 serializer](#concept-ipv4-serializer) on host.
1. Otherwise, if host is an [IPv6 address](#concept-ipv6), return U+005B ([), followed by the
 result of running the [IPv6 serializer](#concept-ipv6-serializer) on host, followed by U+005D (]).
1. Otherwise, host is a [domain](#concept-domain), [opaque host](#opaque-host), or [empty host](#empty-host),
 return host.

   
   

    
The IPv4 serializer takes an [IPv4 address](#concept-ipv4)
address and then runs these steps. They return an [ASCII string](https://infra.spec.whatwg.org/#ascii-string).

    

     1. Let output be the empty string.
1. Let n be the value of address.
1. [For each](https://infra.spec.whatwg.org/#list-iterate) i in the range 1 to 4, inclusive:

      

       1. Prepend n % 256, [serialized](#serialize-an-integer), to
   output.
1. If i is not 4, then prepend U+002E (.) to output.
1. Set n to floor(n / 256).
1. Return output.

   
   

    
The IPv6 serializer takes an [IPv6 address](#concept-ipv6)
address and then runs these steps. They return an [ASCII string](https://infra.spec.whatwg.org/#ascii-string).

    

     1. Let output be the empty string.
1. Let compress be the result of
 [finding the IPv6 address compressed piece index](#find-the-ipv6-address-compressed-piece-index) given address.
1. Let ignore0 be false.
1. [For each](https://infra.spec.whatwg.org/#list-iterate) pieceIndex of address’s
  [pieces](#concept-ipv6-piece)’s [indices](https://infra.spec.whatwg.org/#list-get-the-indices):

      

       1. If ignore0 is true and address[pieceIndex] is 0, then
   [continue](https://infra.spec.whatwg.org/#iteration-continue).
1. Otherwise, if ignore0 is true, set ignore0 to false.
1. If compress is pieceIndex, then:

        

         1. Let separator be "`::`" if pieceIndex is 0; otherwise
     U+003A (:).
1. Append separator to output.
1. Set ignore0 to true and [continue](https://infra.spec.whatwg.org/#iteration-continue).
1. Append address[pieceIndex], represented as the shortest possible
   lowercase hexadecimal number, to output.
1. If pieceIndex is not 7, then append U+003A (:) to output.
1. Return output.

    
This algorithm requires the recommendation from
A Recommendation for IPv6 Address Text Representation.
[[RFC5952]](#biblio-rfc5952)

   
   

    
To find the IPv6 address compressed piece index given an [IPv6 address](#concept-ipv6)
address:

    

     1. Let longestIndex be null.
1. Let longestSize be 1.
1. Let foundIndex be null.
1. Let foundSize be 0.
1. [For each](https://infra.spec.whatwg.org/#list-iterate) pieceIndex of address’s
  [pieces](#concept-ipv6-piece)’s [indices](https://infra.spec.whatwg.org/#list-get-the-indices):

      

       1. If address’s [pieces](#concept-ipv6-piece)[pieceIndex] is not 0:

        

         1. If foundSize is greater than longestSize, then set
     longestIndex to foundIndex and longestSize to
     foundSize.
1. Set foundIndex to null.
1. Set foundSize to 0.
1. Otherwise:

        

         1. If foundIndex is null, then set foundIndex to
     pieceIndex.
1. Increment foundSize by 1.
1. If foundSize is greater than longestSize, then return
 foundIndex.
1. Return longestIndex.

    
In `0:f:0:0:f:f:0:0` it would point to the second 0.

   
   
### 3.7. Host equivalence

   

    
To determine whether a [host](#concept-host) A
equals [host](#concept-host) B,
return true if A is B, and false otherwise.

   
   
Certificate comparison requires a host equivalence check that ignores the
trailing dot of a domain (if any). However, those hosts have also various other facets
enforced, such as DNS length, that are not enforced here, as URLs do not enforce them. If
anyone has a good suggestion for how to bring these two closer together, or what a good
unified model would be, please file an issue.

   
## 4. URLs

   
At a high level, a [URL](#concept-url), [valid URL string](#valid-url-string), [URL parser](#concept-url-parser), and
[URL serializer](#concept-url-serializer) relate as follows:

   

    - The [URL parser](#concept-url-parser) takes an arbitrary [scalar value string](https://infra.spec.whatwg.org/#scalar-value-string) and returns either
 failure or a [URL](#concept-url). It might also record zero or more [validation errors](#validation-error).
- A [URL](#concept-url) can be seen as the in-memory representation.
- A [valid URL string](#valid-url-string) defines what input would not trigger a [validation error](#validation-error) or
 failure when given to the [URL parser](#concept-url-parser). I.e., input that would be considered conforming or
 valid.
- The [URL serializer](#concept-url-serializer) takes a [URL](#concept-url) and returns an [ASCII string](https://infra.spec.whatwg.org/#ascii-string). (If
 that string is then [parsed](#concept-url-parser), the result will [equal](#concept-url-equals) the [URL](#concept-url) that was [serialized](#concept-url-serializer).) The output of the
 [URL serializer](#concept-url-serializer) is not always a [valid URL string](#valid-url-string).

   

    
 
    

     
      | Input | Base | Valid | Output |
| `https:example.org` |  | ❌ | `https://example.org/` |
| `https://////example.com///` |  | ❌ | `https://example.com///` |
| `https://example.com/././foo` |  | ✅ | `https://example.com/foo` |
| `hello:world` | `https://example.com/` | ✅ | `hello:world` |
| `https:example.org` | `https://example.com/` | ❌ | `https://example.com/example.org` |
| `\example\..\demo/.\` | `https://example.com/` | ❌ | `https://example.com/demo/` |
| `example` | `https://example.com/demo` | ✅ | `https://example.com/example` |
| `file:///C|/demo` |  | ❌ | `file:///C:/demo` |
| `..` | `file:///C:/demo` | ✅ | `file:///C:/` |
| `file://localhost/` |  | ✅ | `file:///` |
| `file://loc%61lhost/` |  | ❌ | `file:///` |
| `https://user:password@example.org/` |  | ❌ | `https://user:password@example.org/` |
| `https://example.org/foo bar` |  | ❌ | `https://example.org/foo%20bar` |
| `https://EXAMPLE.com/../x` |  | ✅ | `https://example.com/x` |
| `https://ex ample.org/` |  | ❌ | Failure |
| `example` |  | ❌, due to lack of base | Failure |
| `https://example.com:demo` |  | ❌ | Failure |
| `http://[www.example.com]/` |  | ❌ | Failure |
| `https://example.org//` |  | ✅ | `https://example.org//` |
| `https://example.com/[]?[]#[]` |  | ❌ | `https://example.com/[]?[]#[]` |
| `https://example/%?%#%` |  | ❌ | `https://example/%?%#%` |
| `https://example/%25?%25#%25` |  | ✅ | `https://example/%25?%25#%25` |

    
The base and output [URL](#concept-url) are represented in
 [serialized](#concept-url-serializer) form for brevity.

   
   
### 4.1. URL representation

   
A URL is a [struct](https://infra.spec.whatwg.org/#struct) that
represents a universal identifier. To disambiguate from a [valid URL string](#valid-url-string) it can also be
referred to as a [URL record](#concept-url).

   
A [URL](#concept-url)’s scheme is an
[ASCII string](https://infra.spec.whatwg.org/#ascii-string) that identifies the type of [URL](#concept-url) and can be used to
dispatch a [URL](#concept-url) for further processing after [parsing](#concept-url-parser).
It is initially the empty string.

   
A [URL](#concept-url)’s username is an
[ASCII string](https://infra.spec.whatwg.org/#ascii-string) identifying a username. It is initially the empty string.

   
A [URL](#concept-url)’s password is an
[ASCII string](https://infra.spec.whatwg.org/#ascii-string) identifying a password. It is initially the empty string.

   
A [URL](#concept-url)’s host is null or a
[host](#concept-host). It is initially null.

   

    
The following table lists allowed [URL](#concept-url)’s [scheme](#concept-url-scheme) /
 [host](#concept-url-host) combinations.

    

     
      | [scheme](#concept-url-scheme) | [host](#concept-url-host) |
| [domain](#concept-domain) | [IPv4 address](#concept-ipv4) | [IPv6 address](#concept-ipv6) | [opaque host](#opaque-host) | [empty host](#empty-host) | null |
| [Special schemes](#special-scheme) excluding "`file`" | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| "`file`" | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Others | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |

   
   
A [URL](#concept-url)’s port is either null or a
[16-bit unsigned integer](https://infra.spec.whatwg.org/#16-bit-unsigned-integer) that identifies a networking port. It is initially null.

   
A [URL](#concept-url)’s
path
is a [URL path](#url-path), usually identifying a location. It is initially « ».

   
A [special](#is-special) [URL](#concept-url)’s [path](#concept-url-path) is always a
[list](https://infra.spec.whatwg.org/#list), i.e., it is never [opaque](#url-opaque-path).

   
A [URL](#concept-url)’s query is either
null or an [ASCII string](https://infra.spec.whatwg.org/#ascii-string). It is initially null.

   
A [URL](#concept-url)’s fragment is either null or
an [ASCII string](https://infra.spec.whatwg.org/#ascii-string) that can be used for further processing on the resource the
[URL](#concept-url)’s other components identify. It is initially null.

   
A [URL](#concept-url) also has an associated
blob URL entry that is either null or a
[blob URL entry](https://w3c.github.io/FileAPI/#blob-url-entry). It is initially null.

   
This is used to support caching the object a "`blob`" URL refers to as well
as its origin. It is important that these are cached as the [URL](#concept-url) might be removed from
the [blob URL store](https://w3c.github.io/FileAPI/#BlobURLStore) between parsing and fetching, while fetching will still need to succeed.

   

    
 
    
The following table lists how [valid URL strings](#valid-url-string), when [parsed](#concept-url-parser), map
 to a [URL](#concept-url)’s components. [Username](#concept-url-username), [password](#concept-url-password), and
 [blob URL entry](#concept-url-blob-entry) are omitted; in the examples below they are the empty string, the
 empty string, and null, respectively.

    

     
      | Input | [Scheme](#concept-url-scheme) | [Host](#concept-url-host) | [Port](#concept-url-port) | [Path](#concept-url-path) | [Query](#concept-url-query) | [Fragment](#concept-url-fragment) |
| `https://example.com/` | "`https`" | "`example.com`" | null | « the empty string » | null | null |
| `https://localhost:8000/search?q=text#hello` | "`https`" | "`localhost`" | 8000 | « "`search`" » | "`q=text`" | "`hello`" |
| `urn:isbn:9780307476463` | "`urn`" | null | null | "`isbn:9780307476463`" | null | null |
| `file:///ada/Analytical%20Engine/README.md` | "`file`" | the empty string | null | « "`ada`", "`Analytical%20Engine`", "`README.md`" » | null | null |

   
   
---

   
A URL path is either a [URL path segment](#url-path-segment) or a [list](https://infra.spec.whatwg.org/#list) of zero
or more [URL path segments](#url-path-segment).

   
A URL path segment is an [ASCII string](https://infra.spec.whatwg.org/#ascii-string). It commonly refers to a
directory or a file, but has no predefined meaning.

   
A
single-dot URL path segment
is a [URL path segment](#url-path-segment) that is "`.`" or an [ASCII case-insensitive](https://infra.spec.whatwg.org/#ascii-case-insensitive)
match for "`%2e`".

   
A
double-dot URL path segment
is a [URL path segment](#url-path-segment) that is "`..`" or an [ASCII case-insensitive](https://infra.spec.whatwg.org/#ascii-case-insensitive)
match for "`.%2e`", "`%2e.`", or "`%2e%2e`".

   
### 4.2. URL miscellaneous

   
A special scheme is an [ASCII string](https://infra.spec.whatwg.org/#ascii-string) that is listed in the first column
of the following table. The default port for a [special scheme](#special-scheme) is listed in
the second column on the same row. The [default port](#default-port) for any other [ASCII string](https://infra.spec.whatwg.org/#ascii-string) is
null.

   

    
     | [Special scheme](#special-scheme) | [Default port](#default-port) |
| "`ftp`" | 21 |
| "`file`" | null |
| "`http`" | 80 |
| "`https`" | 443 |
| "`ws`" | 80 |
| "`wss`" | 443 |

   
A [URL](#concept-url) is special if its [scheme](#concept-url-scheme) is a
[special scheme](#special-scheme). A [URL](#concept-url) is not special if its [scheme](#concept-url-scheme) is
not a [special scheme](#special-scheme).

   
A [URL](#concept-url)
includes credentials if its
[username](#concept-url-username) or [password](#concept-url-password) is not the empty string.

   
A [URL](#concept-url) has an opaque path if its [path](#concept-url-path) is a
[URL path segment](#url-path-segment).

   
A [URL](#concept-url) cannot have a username/password/port if its
[host](#concept-url-host) is null or the empty string, or its [scheme](#concept-url-scheme) is
"`file`".

   
A [URL](#concept-url) can be designated as base URL.

   
A [base URL](#concept-base-url) is useful for the [URL parser](#concept-url-parser) when the input might be a
[relative-URL string](#relative-url-string).

   
---

   
A Windows drive letter is two code points, of which the first is an [ASCII alpha](https://infra.spec.whatwg.org/#ascii-alpha)
and the second is either U+003A (:) or U+007C (|).

   
A normalized Windows drive letter is a [Windows drive letter](#windows-drive-letter) of which the second
code point is U+003A (:).

   
As per the [URL writing](#url-writing) section, only a
[normalized Windows drive letter](#normalized-windows-drive-letter) is conforming.

   
A string
starts with a Windows drive letter
if all of the following are true:

   

    - its [length](https://infra.spec.whatwg.org/#string-length) is greater than or equal to 2
- its first two code points are a [Windows drive letter](#windows-drive-letter)
- its [length](https://infra.spec.whatwg.org/#string-length) is 2 or its third code point is U+002F (/), U+005C (\),
 U+003F (?), or U+0023 (#).

   

    
 
    

     
      | String | Starts with a Windows drive letter |
| "`c:`" | ✅ |
| "`c:/`" | ✅ |
| "`c:a`" | ❌ |

   
   

    
To shorten a url’s path:

    

     1. [Assert](https://infra.spec.whatwg.org/#assert): url does not have an [opaque path](#url-opaque-path).
1. Let path be url’s [path](#concept-url-path).
1. If url’s [scheme](#concept-url-scheme) is "`file`", path’s
 [size](https://infra.spec.whatwg.org/#list-size) is 1, and path[0] is a [normalized Windows drive letter](#normalized-windows-drive-letter), then
 return.
1. [Remove](https://infra.spec.whatwg.org/#list-remove) path’s last item, if any.

   
   
### 4.3. URL writing

   
A valid URL string must be either a
[relative-URL-with-fragment string](#relative-url-with-fragment-string) or an [absolute-URL-with-fragment string](#absolute-url-with-fragment-string).

   
An
absolute-URL-with-fragment string must be
an [absolute-URL string](#absolute-url-string), optionally followed by U+0023 (#) and a [URL-fragment string](#url-fragment-string).

   
An absolute-URL string must be one of the following:

   

    - a [URL-scheme string](#url-scheme-string) that is an [ASCII case-insensitive](https://infra.spec.whatwg.org/#ascii-case-insensitive) match for a
 [special scheme](#special-scheme) and not an [ASCII case-insensitive](https://infra.spec.whatwg.org/#ascii-case-insensitive) match for "`file`",
 followed by U+003A (:) and a [scheme-relative-special-URL string](#scheme-relative-special-url-string)
- a [URL-scheme string](#url-scheme-string) that is *not* an [ASCII case-insensitive](https://infra.spec.whatwg.org/#ascii-case-insensitive) match for a
 [special scheme](#special-scheme), followed by U+003A (:) and one of: a [scheme-relative-URL string](#scheme-relative-url-string), a
 [path-absolute-non-authority-URL string](#path-absolute-non-authority-url-string), or an [opaque-path-URL string](#opaque-path-url-string)
- a [URL-scheme string](#url-scheme-string) that is an [ASCII case-insensitive](https://infra.spec.whatwg.org/#ascii-case-insensitive) match for
 "`file`", followed by U+003A (:) and a [scheme-relative-file-URL string](#scheme-relative-file-url-string)

   
any optionally followed by U+003F (?) and a [URL-query string](#url-query-string).

   
A URL-scheme string must be one [ASCII alpha](https://infra.spec.whatwg.org/#ascii-alpha),
followed by zero or more of [ASCII alphanumeric](https://infra.spec.whatwg.org/#ascii-alphanumeric), U+002B (+), U+002D (-), and U+002E (.).
[Schemes](#url-scheme-string) should be registered in the
IANA URI [sic] Schemes registry.
[[IANA-URI-SCHEMES]](#biblio-iana-uri-schemes)
[[RFC7595]](#biblio-rfc7595)

   
A relative-URL-with-fragment string
must be U+0023 (#) followed by a [URL-fragment string](#url-fragment-string), if [base URL](#concept-base-url) has an
[opaque path](#url-opaque-path); otherwise, a [relative-URL string](#relative-url-string), optionally followed by U+0023
(#) and a [URL-fragment string](#url-fragment-string).

   
A relative-URL string must be:

   

    - a [path-absolute-non-authority-URL string](#path-absolute-non-authority-url-string),
- a [path-relative-scheme-less-URL string](#path-relative-scheme-less-url-string),
- or, switching on [base URL](#concept-base-url)’s [scheme](#concept-url-scheme):

     
      A [special scheme](#special-scheme) that is not "`file`"
   
      
       
a [scheme-relative-special-URL string](#scheme-relative-special-url-string)

      "`file`"
   
      
       
a [scheme-relative-file-URL string](#scheme-relative-file-url-string)

      Otherwise
   
      
       
a [scheme-relative-URL string](#scheme-relative-url-string)

   
any optionally followed by U+003F (?) and a [URL-query string](#url-query-string).

   
A non-null [base URL](#concept-base-url) is necessary when [parsing](#concept-url-parser) a
[relative-URL-with-fragment string](#relative-url-with-fragment-string).

   
A scheme-relative-special-URL string must be "`//`", followed by a
[valid host string](#valid-host-string), optionally followed by U+003A (:) and a [URL-port string](#url-port-string), optionally
followed by a [path-absolute-URL string](#path-absolute-url-string).

   
A URL-port string must be one of the following:

   

    - the empty string
- one or more [ASCII digits](https://infra.spec.whatwg.org/#ascii-digit) representing a decimal number that is a
 [16-bit unsigned integer](https://infra.spec.whatwg.org/#16-bit-unsigned-integer).

   
A scheme-relative-URL string must be
"`//`", followed by an [opaque-host-and-port string](#opaque-host-and-port-string), optionally followed by a
[path-absolute-URL string](#path-absolute-url-string).

   
An opaque-host-and-port string must be either the empty string or: a
[valid opaque-host string](#valid-opaque-host-string), optionally followed by U+003A (:) and a [URL-port string](#url-port-string).

   
A scheme-relative-file-URL string must
be "`//`", optionally followed by one of the following:

   

    - a [valid host string](#valid-host-string), optionally followed by a [path-absolute-URL string](#path-absolute-url-string)
- a [path-absolute-URL string](#path-absolute-url-string).

   
A path-absolute-URL string must be U+002F (/),
followed by zero or more [URL-path-segment strings](#url-path-segment-string), separated from each other by U+002F (/).

   
A path-absolute-non-authority-URL string must be a [path-absolute-URL string](#path-absolute-url-string)
that does not start with two U+002F (/) code points.

   
A path-relative-URL string must be zero or more
[URL-path-segment strings](#url-path-segment-string), separated from each other by U+002F (/), and not start with
U+002F (/).

   
A
path-relative-scheme-less-URL string
must be a [path-relative-URL string](#path-relative-url-string) that does not start with: a [URL-scheme string](#url-scheme-string),
followed by U+003A (:).

   
An opaque-path-URL string must be zero or more [URL units](#url-units) excluding
U+003F (?), the first of which (if any) is not U+002F (/).

   
A URL-path-segment string must be one of the
following:

   

    - zero or more [URL units](#url-units) excluding U+002F (/) and U+003F (?), that together are not a
 [single-dot URL path segment](#single-dot-path-segment) or a [double-dot URL path segment](#double-dot-path-segment).
- a [single-dot URL path segment](#single-dot-path-segment)
- a [double-dot URL path segment](#double-dot-path-segment).

   
A URL-query string must be zero or more [URL units](#url-units).

   
A URL-fragment string must be zero or more
[URL units](#url-units).

   
The URL code points are
[ASCII alphanumeric](https://infra.spec.whatwg.org/#ascii-alphanumeric),
U+0021 (!),
U+0024 ($),
U+0026 (&),
U+0027 ('),
U+0028 LEFT PARENTHESIS,
U+0029 RIGHT PARENTHESIS,
U+002A (*),
U+002B (+),
U+002C (,),
U+002D (-),
U+002E (.),
U+002F (/),
U+003A (:),
U+003B (;),
U+003D (=),
U+003F (?),
U+0040 (@),
U+005F (_),
U+007E (~),
and [code points](https://infra.spec.whatwg.org/#code-point) in the range U+00A0 to U+10FFFD, inclusive, excluding [surrogates](https://infra.spec.whatwg.org/#surrogate) and
[noncharacters](https://infra.spec.whatwg.org/#noncharacter).

   
Code points greater than U+007F DELETE will be converted to
[percent-encoded bytes](#percent-encoded-byte) by the [URL parser](#concept-url-parser).

   
In HTML, when the document encoding is a legacy encoding, code points in the
[URL-query string](#url-query-string) that are higher than U+007F DELETE will be converted to
[percent-encoded bytes](#percent-encoded-byte) *using the document’s encoding*. This
can cause problems if a URL that works in one document is copied to another document that uses a
different document encoding. Using the [UTF-8](https://encoding.spec.whatwg.org/#utf-8) encoding everywhere solves this problem.

   

    
 
    
For example, consider this HTML document:

```
`<!doctype html>
<meta charset="windows-1252">
<a href="?sm&ouml;rg&aring;sbord">Test</a>`
```

    
Since the document encoding is windows-1252, the link’s [URL](#concept-url)’s [query](#concept-url-query)
 will be "`sm%F6rg%E5sbord`". If the document encoding had been UTF-8, it would instead
 be "`sm%C3%B6rg%C3%A5sbord`".

   
   
The URL units are [URL code points](#url-code-points) and [percent-encoded bytes](#percent-encoded-byte).

   
[Percent-encoded bytes](#percent-encoded-byte) can be used to encode code points that are not
[URL code points](#url-code-points) or are excluded from being written.

   
---

   
There is no way to express a [username](#concept-url-username) or [password](#concept-url-password) of a
[URL record](#concept-url) within a [valid URL string](#valid-url-string).

   
### 4.4. URL parsing

   

    
The URL parser takes a
[scalar value string](https://infra.spec.whatwg.org/#scalar-value-string) input, with an optional null or [base URL](#concept-base-url)
base (default null) and an optional [encoding](https://encoding.spec.whatwg.org/#encoding) encoding (default
[UTF-8](https://encoding.spec.whatwg.org/#utf-8)), and then runs these steps:

    
Non-web-browser implementations only need to implement the [basic URL parser](#concept-basic-url-parser).

    
How user input in the web browser’s address bar is converted to a
[URL record](#concept-url) is out-of-scope of this standard. This standard does include
[URL rendering requirements](#url-rendering) as they pertain to trust decisions.

    

     1. Let url be the result of running the [basic URL parser](#concept-basic-url-parser) on input
 with base and encoding.
1. If url is failure, return failure.
1. If url’s [scheme](#concept-url-scheme) is not
 "`blob`", return url.
1. Set url’s [blob URL entry](#concept-url-blob-entry) to the result of
 [resolving the blob URL](https://w3c.github.io/FileAPI/#blob-url-resolve) url, if that did not return
 failure, and null otherwise.
1. Return url.

   
   
---

   

    
The basic URL parser takes a
[scalar value string](https://infra.spec.whatwg.org/#scalar-value-string) input, with an optional null or [base URL](#concept-base-url)
base (default null), an optional [encoding](https://encoding.spec.whatwg.org/#encoding) encoding (default
[UTF-8](https://encoding.spec.whatwg.org/#utf-8)), an optional [URL](#concept-url) url,
and an optional state override state override,
and then runs these steps:

    

     
The encoding argument is a legacy concept only relevant for HTML. The
 url and state override arguments are only for use by various APIs. [[HTML]](#biblio-html)

     
When the url and state override arguments are not passed, the
 [basic URL parser](#concept-basic-url-parser) returns either a new [URL](#concept-url) or failure. If they are passed, the
 algorithm modifies the passed url and can terminate without returning anything.

    
    

     1. If url is not given:

      

       1. Set url to a new [URL](#concept-url).
1. If input contains any leading or trailing [C0 control or space](https://infra.spec.whatwg.org/#c0-control-or-space),
   [invalid-URL-unit](#invalid-url-unit) [validation error](#validation-error).
1. Remove any leading and trailing [C0 control or space](https://infra.spec.whatwg.org/#c0-control-or-space) from input.
1. If input contains any [ASCII tab or newline](https://infra.spec.whatwg.org/#ascii-tab-or-newline), [invalid-URL-unit](#invalid-url-unit)
 [validation error](#validation-error).
1. Remove all [ASCII tab or newline](https://infra.spec.whatwg.org/#ascii-tab-or-newline) from input.
1. Let state be state override
 if given, or [scheme start state](#scheme-start-state) otherwise.
1. Set encoding to the result of [getting an output encoding](https://encoding.spec.whatwg.org/#get-an-output-encoding) from
 encoding.
1. Let buffer be the empty string.
1. Let atSignSeen, insideBrackets, and passwordTokenSeen be
 false.
1. Let pointer be a [pointer](#pointer) for input.
1. Keep running the following state machine by switching on state. If after a run
  pointer points to the [EOF code point](#eof-code-point), go to the next step. Otherwise, increase
  pointer by 1 and continue with the state machine.

      
       scheme start state
   
       
        

         1. If [c](#c) is an [ASCII alpha](https://infra.spec.whatwg.org/#ascii-alpha),
     append [c](#c), [lowercased](https://infra.spec.whatwg.org/#ascii-lowercase), to buffer, and
     set state to [scheme state](#scheme-state).
1. Otherwise, if state override is not given, set state to
     [no scheme state](#no-scheme-state) and decrease pointer by 1.
1. Otherwise, return failure.

          
This indication of failure is used exclusively by the `[Location](https://html.spec.whatwg.org/multipage/nav-history-apis.html#location)` object’s
      `[protocol](https://html.spec.whatwg.org/multipage/nav-history-apis.html#dom-location-protocol)` setter.

       scheme state
   
       
        

         1. If [c](#c) is an [ASCII alphanumeric](https://infra.spec.whatwg.org/#ascii-alphanumeric), U+002B (+), U+002D (-), or U+002E (.),
     append [c](#c), [lowercased](https://infra.spec.whatwg.org/#ascii-lowercase), to buffer.
1. Otherwise, if [c](#c) is U+003A (:), then:

          

           1. If state override is given, then:

            

             1. If url’s [scheme](#concept-url-scheme) is a [special scheme](#special-scheme) and
         buffer is not a [special scheme](#special-scheme), then return.
1. If url’s [scheme](#concept-url-scheme) is not a [special scheme](#special-scheme) and
         buffer is a [special scheme](#special-scheme), then return.
1. If url [includes credentials](#include-credentials) or has a non-null [port](#concept-url-port),
         and buffer is "`file`", then return.
1. If url’s [scheme](#concept-url-scheme) is "`file`" and its
         [host](#concept-url-host) is an [empty host](#empty-host), then return.
1. Set url’s [scheme](#concept-url-scheme) to buffer.
1. If state override is given, then:

            

             1. If url’s [port](#concept-url-port) is url’s [scheme](#concept-url-scheme)’s
          [default port](#default-port), then set url’s [port](#concept-url-port) to null.
1. Return.
1. Set buffer to the empty string.
1. If url’s [scheme](#concept-url-scheme) is "`file`", then:

            

             1. If [remaining](#remaining) does not start with "`//`",
         [special-scheme-missing-following-solidus](#special-scheme-missing-following-solidus) [validation error](#validation-error).
1. Set state to [file state](#file-state).
1. Otherwise, if url [is special](#is-special), base is non-null, and
        base’s [scheme](#concept-url-scheme) is url’s [scheme](#concept-url-scheme):

            

             1. [Assert](https://infra.spec.whatwg.org/#assert): base [is special](#is-special) (and therefore does not have
         an [opaque path](#url-opaque-path)).
1. Set state to [special relative or authority state](#special-relative-or-authority-state).
1. Otherwise, if url [is special](#is-special), set state to
       [special authority slashes state](#special-authority-slashes-state).
1. Otherwise, if [remaining](#remaining) starts with an U+002F (/), set state to
       [path or authority state](#path-or-authority-state) and increase pointer by 1.
1. Otherwise, set url’s [path](#concept-url-path) to the empty string and set
       state to [opaque path state](#cannot-be-a-base-url-path-state).
1. Otherwise, if state override is not given, set
     buffer to the empty string, state to
     [no scheme state](#no-scheme-state), and start over (from the first code point
     in input).
1. Otherwise, return failure.

          
This indication of failure is used exclusively by the `[Location](https://html.spec.whatwg.org/multipage/nav-history-apis.html#location)` object’s
      `[protocol](https://html.spec.whatwg.org/multipage/nav-history-apis.html#dom-location-protocol)` setter. Furthermore, the non-failure termination earlier in this state
      is an intentional difference for defining that setter.

       no scheme state
   
       
        

         1. If base is null, or base has an [opaque path](#url-opaque-path) and
     [c](#c) is not U+0023 (#), [missing-scheme-non-relative-URL](#missing-scheme-non-relative-url) [validation error](#validation-error),
     return failure.
1. Otherwise, if base has an [opaque path](#url-opaque-path) and [c](#c) is
     U+0023 (#), set url’s [scheme](#concept-url-scheme) to
     base’s [scheme](#concept-url-scheme),
     url’s [path](#concept-url-path) to
     base’s [path](#concept-url-path),
     url’s [query](#concept-url-query) to
     base’s [query](#concept-url-query),
     url’s [fragment](#concept-url-fragment) to the empty string, and set state to
     [fragment state](#fragment-state).
1. Otherwise, if base’s [scheme](#concept-url-scheme) is not "`file`", set
     state to [relative state](#relative-state) and decrease pointer by 1.
1. Otherwise, set state to [file state](#file-state) and decrease pointer
     by 1.

       special relative or authority state
   
       
        

         1. If [c](#c) is U+002F (/) and [remaining](#remaining) starts with U+002F (/), then set
     state to [special authority ignore slashes state](#special-authority-ignore-slashes-state) and increase
     pointer by 1.
1. Otherwise, [special-scheme-missing-following-solidus](#special-scheme-missing-following-solidus) [validation error](#validation-error), set
     state to [relative state](#relative-state) and decrease pointer by 1.

       path or authority state
   
       
        

         1. If [c](#c) is U+002F (/), then set state to [authority state](#authority-state).
1. Otherwise, set state to [path state](#path-state), and decrease pointer
     by 1.

       relative state
   
       
        

         1. Assert: base’s [scheme](#concept-url-scheme) is not "`file`".
1. Set url’s [scheme](#concept-url-scheme) to base’s [scheme](#concept-url-scheme).
1. If [c](#c) is U+002F (/), then set state to [relative slash state](#relative-slash-state).
1. Otherwise, if url [is special](#is-special) and [c](#c) is U+005C (\),
     [invalid-reverse-solidus](#invalid-reverse-solidus) [validation error](#validation-error), set state to
     [relative slash state](#relative-slash-state).
1. Otherwise:

          

           1. Set url’s [username](#concept-url-username) to
       base’s [username](#concept-url-username),
       url’s [password](#concept-url-password) to
       base’s [password](#concept-url-password),
       url’s [host](#concept-url-host) to
       base’s [host](#concept-url-host),
       url’s [port](#concept-url-port) to
       base’s [port](#concept-url-port),
       url’s [path](#concept-url-path) to a [clone](https://infra.spec.whatwg.org/#list-clone) of
       base’s [path](#concept-url-path), and
       url’s [query](#concept-url-query) to
       base’s [query](#concept-url-query).
1. If [c](#c) is U+003F (?), then set url’s [query](#concept-url-query) to the empty
       string, and state to [query state](#query-state).
1. Otherwise, if [c](#c) is U+0023 (#), set url’s [fragment](#concept-url-fragment) to
       the empty string and state to [fragment state](#fragment-state).
1. Otherwise, if [c](#c) is not the [EOF code point](#eof-code-point):

            

             1. Set url’s [query](#concept-url-query) to null.
1. [Shorten](#shorten-a-urls-path) url’s [path](#concept-url-path).
1. Set state to [path state](#path-state) and decrease pointer by 1.

       relative slash state
   
       
        

         1. If url [is special](#is-special) and [c](#c) is U+002F (/) or U+005C (\), then:

          

           1. If [c](#c) is U+005C (\), [invalid-reverse-solidus](#invalid-reverse-solidus)
       [validation error](#validation-error).
1. Set state to [special authority ignore slashes state](#special-authority-ignore-slashes-state).
1. Otherwise, if [c](#c) is U+002F (/), then set state to
     [authority state](#authority-state).
1. Otherwise, set
     url’s [username](#concept-url-username) to
     base’s [username](#concept-url-username),
     url’s [password](#concept-url-password) to
     base’s [password](#concept-url-password),
     url’s [host](#concept-url-host) to
     base’s [host](#concept-url-host),
     url’s [port](#concept-url-port) to
     base’s [port](#concept-url-port),
     state to [path state](#path-state), and then, decrease pointer by 1.

       special authority slashes state
   
       
        

         1. If [c](#c) is U+002F (/) and [remaining](#remaining) starts with U+002F (/), then set
     state to [special authority ignore slashes state](#special-authority-ignore-slashes-state) and increase
     pointer by 1.
1. Otherwise, [special-scheme-missing-following-solidus](#special-scheme-missing-following-solidus) [validation error](#validation-error), set
     state to [special authority ignore slashes state](#special-authority-ignore-slashes-state) and decrease
     pointer by 1.

       special authority ignore slashes state
   
       
        

         1. If [c](#c) is neither U+002F (/) nor U+005C (\), then set state to
     [authority state](#authority-state) and decrease pointer by 1.
1. Otherwise, [special-scheme-missing-following-solidus](#special-scheme-missing-following-solidus) [validation error](#validation-error).

       authority state
   
       
        

         1. If [c](#c) is U+0040 (@), then:

          

           1. [Invalid-credentials](#invalid-credentials) [validation error](#validation-error).
1. If atSignSeen is true, then prepend "`%40`" to
       buffer.
1. Set atSignSeen to true.
1. For each codePoint in buffer:

            

             1. If codePoint is U+003A (:) and passwordTokenSeen is false,
         then set passwordTokenSeen to true and [continue](https://infra.spec.whatwg.org/#iteration-continue).
1. Let encodedCodePoints be the result of running
         [UTF-8 percent-encode](#utf-8-percent-encode) codePoint using the
         [userinfo percent-encode set](#userinfo-percent-encode-set).
1. If passwordTokenSeen is true, then append encodedCodePoints to
         url’s [password](#concept-url-password).
1. Otherwise, append encodedCodePoints to url’s
         [username](#concept-url-username).
1. Set buffer to the empty string.
1. Otherwise, if one of the following is true:

          

           - [c](#c) is the [EOF code point](#eof-code-point), U+002F (/), U+003F (?), or U+0023 (#)
- url [is special](#is-special) and [c](#c) is U+005C (\)

          
then:

          

           1. If atSignSeen is true and buffer is the empty string,
       [host-missing](#host-missing) [validation error](#validation-error), return failure.
1. Decrease pointer by buffer’s
       [code point length](https://infra.spec.whatwg.org/#string-code-point-length) + 1, set buffer to the empty string, and set
       state to [host state](#host-state).
1. Otherwise, append [c](#c) to buffer.

       host state
   
       hostname state
   
       
        

         1. If state override is given and url’s [scheme](#concept-url-scheme) is
     "`file`", then decrease pointer by 1 and set state to
     [file host state](#file-host-state).
1. Otherwise, if [c](#c) is U+003A (:) and insideBrackets is false:

          

           1. If buffer is the empty string, [host-missing](#host-missing) [validation error](#validation-error),
       return failure.
1. If state override is given and state override is
       [hostname state](#hostname-state), then return failure.
1. Let host be the result of [host parsing](#concept-host-parser) buffer with
       url [is not special](#is-not-special).
1. If host is failure, then return failure.
1. Set url’s [host](#concept-url-host) to
       host, buffer to the empty string,
       and state to [port state](#port-state).
1. Otherwise, if one of the following is true:

          

           - [c](#c) is the [EOF code point](#eof-code-point), U+002F (/), U+003F (?), or U+0023 (#)
- url [is special](#is-special) and [c](#c) is U+005C (\)

          
then decrease pointer by 1, and:

          

           1. If url [is special](#is-special) and buffer is the empty string,
       [host-missing](#host-missing) [validation error](#validation-error), return failure.
1. Otherwise, if state override is given, buffer is the empty
       string, and either url [includes credentials](#include-credentials) or url’s
       [port](#concept-url-port) is non-null, then return failure.
1. Let host be the result of [host parsing](#concept-host-parser) buffer with
       url [is not special](#is-not-special).
1. If host is failure, then return failure.
1. Set url’s [host](#concept-url-host) to
       host, buffer to the empty string,
       and state to [path start state](#path-start-state).
1. If state override is given, then return.
1. Otherwise:

          

           1. If [c](#c) is U+005B ([), then set insideBrackets to true.
1. If [c](#c) is U+005D (]), then set insideBrackets to false.
1. Append [c](#c) to buffer.

       port state
   
       
        

         1. If [c](#c) is an [ASCII digit](https://infra.spec.whatwg.org/#ascii-digit), append [c](#c) to buffer.
1. Otherwise, if one of the following is true:

          

           - [c](#c) is the [EOF code point](#eof-code-point), U+002F (/), U+003F (?), or U+0023 (#);
- url [is special](#is-special) and [c](#c) is U+005C (\); or
- state override is given,

          
then:

          

           1. If buffer is not the empty string:

            

             1. Let port be the mathematical integer value that is represented
         by buffer in radix-10 using [ASCII digits](https://infra.spec.whatwg.org/#ascii-digit) for digits with values
         0 through 9.
1. If port is not a [16-bit unsigned integer](https://infra.spec.whatwg.org/#16-bit-unsigned-integer),
         [port-out-of-range](#port-out-of-range) [validation error](#validation-error), return failure.
1. Set url’s [port](#concept-url-port) to null, if port is
         url’s [scheme](#concept-url-scheme)’s [default port](#default-port); otherwise to port.
1. Set buffer to the empty string.
1. If state override is given, then return.
1. If state override is given, then return failure.
1. Set state to [path start state](#path-start-state) and decrease pointer by 1.
1. Otherwise, [port-invalid](#port-invalid) [validation error](#validation-error), return failure.

       file state
   
       
        

         1. Set url’s [scheme](#concept-url-scheme) to "`file`".
1. Set url’s [host](#concept-url-host) to the empty string.
1. If [c](#c) is U+002F (/) or U+005C (\), then:

          

           1. If [c](#c) is U+005C (\), [invalid-reverse-solidus](#invalid-reverse-solidus) [validation error](#validation-error).
1. Set state to [file slash state](#file-slash-state).
1. Otherwise, if base is non-null and base’s [scheme](#concept-url-scheme) is
      "`file`":

          

           1. Set url’s [host](#concept-url-host) to base’s [host](#concept-url-host),
       url’s [path](#concept-url-path) to a [clone](https://infra.spec.whatwg.org/#list-clone) of base’s
       [path](#concept-url-path), and url’s [query](#concept-url-query) to base’s
       [query](#concept-url-query).
1. If [c](#c) is U+003F (?), then set url’s [query](#concept-url-query) to the empty
       string and state to [query state](#query-state).
1. Otherwise, if [c](#c) is U+0023 (#), set url’s [fragment](#concept-url-fragment) to
       the empty string and state to [fragment state](#fragment-state).
1. Otherwise, if [c](#c) is not the [EOF code point](#eof-code-point):

            

             1. Set url’s [query](#concept-url-query) to null.
1. If the
         [code point substring](https://infra.spec.whatwg.org/#code-point-substring-to-the-end-of-the-string) from
         pointer to the end of input does not
         [start with a Windows drive letter](#start-with-a-windows-drive-letter), then [shorten](#shorten-a-urls-path) url’s
         [path](#concept-url-path).
1. Otherwise:

              

               1. [File-invalid-Windows-drive-letter](#file-invalid-windows-drive-letter) [validation error](#validation-error).
1. Set url’s [path](#concept-url-path) to « ».

              
This is a (platform-independent) Windows drive letter quirk.
1. Set state to [path state](#path-state) and decrease pointer by 1.
1. Otherwise, set state to [path state](#path-state), and decrease pointer
     by 1.

       file slash state
   
       
        

         1. If [c](#c) is U+002F (/) or U+005C (\), then:

          

           1. If [c](#c) is U+005C (\), [invalid-reverse-solidus](#invalid-reverse-solidus) [validation error](#validation-error).
1. Set state to [file host state](#file-host-state).
1. Otherwise:

          

           1. If base is non-null and base’s [scheme](#concept-url-scheme) is
        "`file`", then:

            

             1. Set url’s [host](#concept-url-host) to base’s [host](#concept-url-host).
1. If the [code point substring](https://infra.spec.whatwg.org/#code-point-substring-to-the-end-of-the-string)
          from pointer to the end of input does not
          [start with a Windows drive letter](#start-with-a-windows-drive-letter) and base’s [path](#concept-url-path)[0] is a
          [normalized Windows drive letter](#normalized-windows-drive-letter), then [append](https://infra.spec.whatwg.org/#list-append) base’s
          [path](#concept-url-path)[0] to url’s [path](#concept-url-path).

              
This is a (platform-independent) Windows drive letter quirk.
1. Set state to [path state](#path-state), and decrease pointer by 1.

       file host state
   
       
        

         1. If [c](#c) is the [EOF code point](#eof-code-point), U+002F (/), U+005C (\), U+003F (?), or
      U+0023 (#), then decrease pointer by 1 and then:

          

           1. If state override is not given and buffer is a
        [Windows drive letter](#windows-drive-letter), [file-invalid-Windows-drive-letter-host](#file-invalid-windows-drive-letter-host)
        [validation error](#validation-error), set state to [path state](#path-state).

            
This is a (platform-independent) Windows drive letter quirk. buffer
        is not reset here and instead used in the [path state](#path-state).
1. Otherwise, if buffer is the empty string, then:

            

             1. Set url’s [host](#concept-url-host) to the empty string.
1. If state override is given, then return.
1. Set state to [path start state](#path-start-state).
1. Otherwise, run these steps:

            

             1. Let host be the result of [host parsing](#concept-host-parser) buffer with
         url [is not special](#is-not-special).
1. If host is failure, then return failure.
1. If host is "`localhost`", then set host to
         the empty string.
1. Set url’s [host](#concept-url-host) to host.
1. If state override is given, then return.
1. Set buffer to the empty string and state to
         [path start state](#path-start-state).
1. Otherwise, append [c](#c) to buffer.

       path start state
   
       
        

         1. If url [is special](#is-special), then:

          

           1. If [c](#c) is U+005C (\), [invalid-reverse-solidus](#invalid-reverse-solidus) [validation error](#validation-error).
1. Set state to [path state](#path-state).
1. If [c](#c) is neither U+002F (/) nor U+005C (\), then decrease pointer
       by 1.
1. Otherwise, if state override is not given and [c](#c) is U+003F (?), set
     url’s [query](#concept-url-query) to the empty string and state to
     [query state](#query-state).
1. Otherwise, if state override is not given and [c](#c) is U+0023 (#), set
     url’s [fragment](#concept-url-fragment) to the empty string and state to
     [fragment state](#fragment-state).
1. Otherwise, if [c](#c) is not the [EOF code point](#eof-code-point):

          

           1. Set state to [path state](#path-state).
1. If [c](#c) is not U+002F (/), then decrease pointer by 1.
1. Otherwise, if state override is given and url’s
     [host](#concept-url-host) is null, [append](https://infra.spec.whatwg.org/#list-append) the empty string to url’s
     [path](#concept-url-path).

       path state
   
       
        

         1. If one of the following is true:

          

           - [c](#c) is the [EOF code point](#eof-code-point) or U+002F (/)
- url [is special](#is-special) and [c](#c) is U+005C (\)
- state override is not given and [c](#c) is U+003F (?) or U+0023 (#)

          
then:

          

           1. If url [is special](#is-special) and [c](#c) is U+005C (\),
       [invalid-reverse-solidus](#invalid-reverse-solidus) [validation error](#validation-error).
1. If buffer is a [double-dot URL path segment](#double-dot-path-segment), then:

            

             1. [Shorten](#shorten-a-urls-path) url’s [path](#concept-url-path).
1. If neither [c](#c) is U+002F (/), nor url [is special](#is-special) and [c](#c) is
          U+005C (\), [append](https://infra.spec.whatwg.org/#list-append) the empty string to url’s
          [path](#concept-url-path).

              
This means that for input `/usr/..` the result is `/`
          and not a lack of a path.
1. Otherwise, if buffer is a [single-dot URL path segment](#single-dot-path-segment) and if neither
       [c](#c) is U+002F (/), nor url [is special](#is-special) and [c](#c) is U+005C (\),
       [append](https://infra.spec.whatwg.org/#list-append) the empty string to url’s [path](#concept-url-path).
1. Otherwise, if buffer is not a [single-dot URL path segment](#single-dot-path-segment), then:

            

             1. If url’s [scheme](#concept-url-scheme) is "`file`", url’s
          [path](#concept-url-path) [is empty](https://infra.spec.whatwg.org/#list-is-empty), and buffer is a
          [Windows drive letter](#windows-drive-letter), then replace the second code point in buffer with
          U+003A (:).

              
This is a (platform-independent) Windows drive letter quirk.
1. [Append](https://infra.spec.whatwg.org/#list-append) buffer to url’s [path](#concept-url-path).
1. Set buffer to the empty string.
1. If [c](#c) is U+003F (?), then set url’s [query](#concept-url-query) to the empty
       string and state to [query state](#query-state).
1. If [c](#c) is U+0023 (#), then set url’s [fragment](#concept-url-fragment) to the
       empty string and state to [fragment state](#fragment-state).
1. Otherwise, run these steps:

          

           1. If [c](#c) is not a [URL code point](#url-code-points) and not U+0025 (%),
       [invalid-URL-unit](#invalid-url-unit) [validation error](#validation-error).
1. If [c](#c) is U+0025 (%) and [remaining](#remaining) does not start with two
       [ASCII hex digits](https://infra.spec.whatwg.org/#ascii-hex-digit), [invalid-URL-unit](#invalid-url-unit) [validation error](#validation-error).
1. [UTF-8 percent-encode](#utf-8-percent-encode) [c](#c) using the
       [path percent-encode set](#path-percent-encode-set) and append the result to buffer.

       opaque path state
   
       
        

         1. If [c](#c) is U+003F (?), then set url’s [query](#concept-url-query) to the empty
     string and state to [query state](#query-state).
1. Otherwise, if [c](#c) is U+0023 (#), then set url’s [fragment](#concept-url-fragment)
     to the empty string and state to [fragment state](#fragment-state).
1. Otherwise, if [c](#c) is U+0020 SPACE:

          

           1. [Invalid-URL-unit](#invalid-url-unit) [validation error](#validation-error).
1. If [remaining](#remaining) starts with U+003F (?) or U+0023 (#), then append
       "`%20`" to url’s [path](#concept-url-path).
1. Otherwise, append U+0020 SPACE to url’s [path](#concept-url-path).
1. Otherwise, if [c](#c) is not the [EOF code point](#eof-code-point):

          

           1. If [c](#c) is not a [URL code point](#url-code-points) and not U+0025 (%), [invalid-URL-unit](#invalid-url-unit)
       [validation error](#validation-error).
1. If [c](#c) is U+0025 (%) and [remaining](#remaining) does not start with two
       [ASCII hex digits](https://infra.spec.whatwg.org/#ascii-hex-digit), [invalid-URL-unit](#invalid-url-unit) [validation error](#validation-error).
1. [UTF-8 percent-encode](#utf-8-percent-encode) [c](#c) using the
       [C0 control percent-encode set](#c0-control-percent-encode-set) and append the result to url’s
       [path](#concept-url-path).

       query state
   
       
        

         1. If encoding is not [UTF-8](https://encoding.spec.whatwg.org/#utf-8) and one of the following is true:

          

           - url [is not special](#is-not-special)
- url’s [scheme](#concept-url-scheme) is "`ws`" or "`wss`"

          
then set encoding to [UTF-8](https://encoding.spec.whatwg.org/#utf-8).
1. If one of the following is true:

          

           - state override is not given and [c](#c) is U+0023 (#)
- [c](#c) is the [EOF code point](#eof-code-point)

          
then:

          

           1. Let queryPercentEncodeSet be the [special-query percent-encode set](#special-query-percent-encode-set) if
       url [is special](#is-special); otherwise the [query percent-encode set](#query-percent-encode-set).
1. [Percent-encode after encoding](#string-percent-encode-after-encoding), with encoding,
        buffer, and queryPercentEncodeSet, and append the result to
        url’s [query](#concept-url-query).

            
This operation cannot be invoked code-point-for-code-point due to the stateful
        [ISO-2022-JP encoder](https://encoding.spec.whatwg.org/#iso-2022-jp-encoder).
1. Set buffer to the empty string.
1. If [c](#c) is U+0023 (#), then set url’s [fragment](#concept-url-fragment) to
       the empty string and state to [fragment state](#fragment-state).
1. Otherwise, if [c](#c) is not the [EOF code point](#eof-code-point):

          

           1. If [c](#c) is not a [URL code point](#url-code-points) and not U+0025 (%),
       [invalid-URL-unit](#invalid-url-unit) [validation error](#validation-error).
1. If [c](#c) is U+0025 (%) and [remaining](#remaining) does not start with two
       [ASCII hex digits](https://infra.spec.whatwg.org/#ascii-hex-digit), [invalid-URL-unit](#invalid-url-unit) [validation error](#validation-error).
1. Append [c](#c) to buffer.

       fragment state
   
       
        

         1. If [c](#c) is not the [EOF code point](#eof-code-point), then:

          

           1. If [c](#c) is not a [URL code point](#url-code-points) and not U+0025 (%),
       [invalid-URL-unit](#invalid-url-unit) [validation error](#validation-error).
1. If [c](#c) is U+0025 (%) and [remaining](#remaining) does not start with two
       [ASCII hex digits](https://infra.spec.whatwg.org/#ascii-hex-digit), [invalid-URL-unit](#invalid-url-unit) [validation error](#validation-error).
1. [UTF-8 percent-encode](#utf-8-percent-encode) [c](#c) using the
       [fragment percent-encode set](#fragment-percent-encode-set) and append the result to url’s
       [fragment](#concept-url-fragment).
1. Return url.

   
   
---

   

    
To set the username given a url and
username, set url’s [username](#concept-url-username) to the result of running
[UTF-8 percent-encode](#string-utf-8-percent-encode) on username using the
[userinfo percent-encode set](#userinfo-percent-encode-set).

   
   

    
To set the password given a url and
password, set url’s [password](#concept-url-password) to the result of running
[UTF-8 percent-encode](#string-utf-8-percent-encode) on password using the
[userinfo percent-encode set](#userinfo-percent-encode-set).

   
   
### 4.5. URL serializing

   

    
The URL serializer takes a
[URL](#concept-url) url, with an optional boolean
exclude fragment (default false), and then runs
these steps. They return an [ASCII string](https://infra.spec.whatwg.org/#ascii-string).

    

     1. Let output be url’s [scheme](#concept-url-scheme) and U+003A (:) concatenated.
1. If url’s [host](#concept-url-host) is non-null:

      

       1. Append "`//`" to output.
1. If url [includes credentials](#include-credentials), then:

        

         1. Append url’s [username](#concept-url-username) to
     output.
1. If url’s [password](#concept-url-password) is not the empty string, then append
     U+003A (:), followed by url’s [password](#concept-url-password), to output.
1. Append U+0040 (@) to output.
1. Append url’s [host](#concept-url-host),
   [serialized](#concept-host-serializer), to output.
1. If url’s [port](#concept-url-port) is non-null, append U+003A (:) followed by
   url’s [port](#concept-url-port), [serialized](#serialize-an-integer), to
   output.
1. If url’s [host](#concept-url-host) is null, url does not have an
  [opaque path](#url-opaque-path), url’s [path](#concept-url-path)’s [size](https://infra.spec.whatwg.org/#list-size) is greater
  than 1, and url’s [path](#concept-url-path)[0] is the empty string, then append U+002F (/)
  followed by U+002E (.) to output.

      
This prevents `web+demo:/.//not-a-host/` or
  `web+demo:/path/..//not-a-host/`, when [parsed](#concept-url-parser) and then
  [serialized](#concept-url-serializer), from ending up as `web+demo://not-a-host/` (they
  end up as `web+demo:/.//not-a-host/`).
1. Append the result of [URL path serializing](#url-path-serializer) url to output.
1. If url’s [query](#concept-url-query) is non-null, append
 U+003F (?), followed by url’s [query](#concept-url-query), to
 output.
1. If exclude fragment is false and url’s [fragment](#concept-url-fragment) is
 non-null, then append U+0023 (#), followed by url’s [fragment](#concept-url-fragment), to
 output.
1. Return output.

   
   

    
The URL path serializer takes a
[URL](#concept-url) url and then runs these steps. They return an [ASCII string](https://infra.spec.whatwg.org/#ascii-string).

    

     1. If url has an [opaque path](#url-opaque-path), then return url’s
 [path](#concept-url-path).
1. Let output be the empty string.
1. [For each](https://infra.spec.whatwg.org/#list-iterate) segment of url’s [path](#concept-url-path): append
 U+002F (/) followed by segment to output.
1. Return output.

   
   
### 4.6. URL equivalence

   

    
To determine whether a [URL](#concept-url) A
equals [URL](#concept-url) B, with
an optional boolean exclude fragments (default false),
run these steps:

    

     1. Let serializedA be the result of [serializing](#concept-url-serializer)
 A, with [*exclude fragment*](#url-serializer-exclude-fragment) set to
 exclude fragments.
1. Let serializedB be the result of [serializing](#concept-url-serializer)
 B, with [*exclude fragment*](#url-serializer-exclude-fragment) set to
 exclude fragments.
1. Return true if serializedA is serializedB; otherwise false.

   
   
### 4.7. Origin

   
See [origin](https://html.spec.whatwg.org/multipage/browsers.html#concept-origin)’s definition in HTML for the necessary background
information. [[HTML]](#biblio-html)

   

    
The origin of a [URL](#concept-url) url
is the [origin](https://html.spec.whatwg.org/multipage/browsers.html#concept-origin) returned by running these steps, switching on url’s
[scheme](#concept-url-scheme):

    
     "`blob`"
 
     
      

       1. If url’s [blob URL entry](#concept-url-blob-entry) is non-null, then return
   url’s [blob URL entry](#concept-url-blob-entry)’s [environment](https://w3c.github.io/FileAPI/#blob-url-entry-environment)’s
   [origin](https://html.spec.whatwg.org/multipage/webappapis.html#concept-settings-object-origin).
1. Let pathURL be the result of [parsing](#concept-basic-url-parser) the result of
   [URL path serializing](#url-path-serializer) url.
1. If pathURL is failure, then return a new [opaque origin](https://html.spec.whatwg.org/multipage/browsers.html#concept-origin-opaque).
1. If pathURL’s [scheme](#concept-url-scheme) is "`http`",
   "`https`", or "`file`", then return pathURL’s
   [origin](#concept-url-origin).
1. Return a new [opaque origin](https://html.spec.whatwg.org/multipage/browsers.html#concept-origin-opaque).

      
The [origin](#concept-url-origin) of
  `blob:https://whatwg.org/d0360e2f-caee-469f-9a2f-87d5b0456f6f` is the
  [tuple origin](https://html.spec.whatwg.org/multipage/browsers.html#concept-origin-tuple) ("`https`", "`whatwg.org`", null, null).

     "`ftp`"
 
     "`http`"
 
     "`https`"
 
     "`ws`"
 
     "`wss`"
 
     
      
Return the [tuple origin](https://html.spec.whatwg.org/multipage/browsers.html#concept-origin-tuple) (url’s [scheme](#concept-url-scheme),
 url’s [host](#concept-url-host), url’s [port](#concept-url-port), null).

     "`file`"
 
     
      
Unfortunate as it is, this is left as an exercise to the reader. When in doubt,
 return a new [opaque origin](https://html.spec.whatwg.org/multipage/browsers.html#concept-origin-opaque).

     Otherwise
 
     
      
Return a new [opaque origin](https://html.spec.whatwg.org/multipage/browsers.html#concept-origin-opaque).

      
This does indeed mean that these [URLs](#concept-url) cannot be [same origin](https://html.spec.whatwg.org/multipage/browsers.html#same-origin) with
  themselves.

    
   
   
### 4.8. URL rendering

   
A [URL](#concept-url) should be rendered in its [serialized](#concept-url-serializer) form, with
modifications described below, when the primary purpose of displaying a URL is to have the user make
a security or trust decision. For example, users are expected to make trust decisions based on a URL
rendered in the browser address bar.

   
#### 4.8.1. Simplify non-human-readable or irrelevant components

   
Remove components that can provide opportunities for spoofing or distract from security-relevant
information:

   

    - Browsers may render only a URL’s [host](#concept-url-host) in places where it is important for end
 users to distinguish between the host and other parts of the URL such as the [path](#concept-url-path).
 Browsers may consider simplifying the host further to draw attention to its
 [registrable domain](#host-registrable-domain). For example, browsers may omit a leading `www` or
 `m` [domain label](#domain-label) to simplify the host, or display its registrable domain
 only to remove spoofing opportunities posted by subdomains (e.g.,
 `https://examplecorp.attacker.com/`).
- Browsers should not render a [URL](#concept-url)’s [username](#concept-url-username) and [password](#concept-url-password), as they can be mistaken for a [URL](#concept-url)’s [host](#concept-url-host) (e.g.,
 `https://examplecorp.com@attacker.example/`).
- Browsers may render a URL without its [scheme](#concept-url-scheme) if the display surface only ever
 permits a single scheme (such as a browser feature that omits `https://` because it is
 only enabled for secure origins). Otherwise, the scheme may be replaced or supplemented with a
 human-readable string (e.g., "Not secure"), a security indicator icon, or both.

   
#### 4.8.2. Elision

   
In a space-constrained display, URLs should be elided carefully to avoid misleading the user when
making a security decision:

   

    - Browsers should ensure that at least the [registrable domain](#host-registrable-domain) can be shown
 when the URL is rendered (to avoid showing, e.g., `...examplecorp.com` when loading
 `https://not-really-examplecorp.com/`).
- When the full [host](#concept-url-host) cannot be rendered, browsers should elide
 [domain labels](#domain-label) starting from the lowest-level domain label. For example,
 `examplecorp.com.evil.com` should be elided as `...com.evil.com`, not
 `examplecorp.com...`. (Note that bidirectional text means that the lowest-level domain
 label may not appear on the left.)

   
#### 4.8.3. Internationalization and special characters

   
Internationalized domain names (IDNs), special characters, and bidirectional text should be
handled with care to prevent spoofing:

   

    - If [URL](#concept-url)’s [host](#concept-url-host) is a [domain](#concept-domain), browsers should render it
  by running [domain to Unicode](#concept-domain-to-unicode) with the [URL](#concept-url)’s [host](#concept-url-host).

     
Various characters can be used in homograph spoofing attacks. Consider detecting
  confusable characters and warning when they are in use. [[IDNFAQ]](#biblio-idnfaq) [[UTS39]](#biblio-uts39)
- URLs are particularly prone to confusion between host and path when they contain
 bidirectional text, so in this case it is particularly advisable to only render a URL’s
 [host](#concept-url-host). For readability, other parts of the [URL](#concept-url), if rendered, should have
 their sequences of [percent-encoded bytes](#percent-encoded-byte) replaced with code points resulting from running
 [UTF-8 decode without BOM](https://encoding.spec.whatwg.org/#utf-8-decode-without-bom) on the [percent-decoding](#string-percent-decode) of those sequences,
 unless that renders those sequences invisible. Browsers may choose to not decode certain sequences
 that present spoofing risks (e.g., U+1F512 (🔒)).
- Browsers should render bidirectional text as if it were in a left-to-right embedding. [[BIDI]](#biblio-bidi)

     
Unfortunately, as rendered [URLs](#concept-url) are strings and can appear anywhere, a
  specific bidirectional algorithm for rendered [URLs](#concept-url) would not see wide adoption.
  Bidirectional text interacts with the parts of a [URL](#concept-url) in ways that can cause the
  rendering to be different from the model. Users of bidirectional languages can come to expect
  this, particularly in plain text environments.

   
## 5. `application/x-www-form-urlencoded`

   
The `application/x-www-form-urlencoded` format
provides a way to encode a [list](https://infra.spec.whatwg.org/#list) of [tuples](https://infra.spec.whatwg.org/#tuple), each consisting of a name and a
value.

   
The `application/x-www-form-urlencoded` format is in many ways an aberrant
monstrosity, the result of many years of implementation accidents and compromises leading to a set
of requirements necessary for interoperability, but in no way representing good design practices. In
particular, readers are cautioned to pay close attention to the twisted details involving repeated
(and in some cases nested) conversions between character encodings and byte sequences. Unfortunately
the format is in widespread use due to the prevalence of HTML forms. [[HTML]](#biblio-html)

   
### 5.1. `application/x-www-form-urlencoded` parsing

   
A legacy server-oriented implementation might have to support [encodings](https://encoding.spec.whatwg.org/#encoding)
other than [UTF-8](https://encoding.spec.whatwg.org/#utf-8) as well as have special logic for tuples of which the name is
``_charset``. Such logic is not described here as only [UTF-8](https://encoding.spec.whatwg.org/#utf-8) is conforming.

   

    
The
`application/x-www-form-urlencoded` parser
takes a byte sequence input, and then runs these steps:

    

     1. Let sequences be the result of splitting input on
 0x26 (&).
1. Let output be an initially empty [list](https://infra.spec.whatwg.org/#list) of name-value tuples where
 both name and value hold a string.
1. [For each](https://infra.spec.whatwg.org/#list-iterate) byte sequence bytes in sequences:

      

       1. If bytes is the empty byte sequence, then [continue](https://infra.spec.whatwg.org/#iteration-continue).
1. If bytes contains a 0x3D (=), then let
   name be the bytes from the start of bytes up to but
   excluding its first 0x3D (=), and let value be the
   bytes, if any, after the first 0x3D (=) up to the end of
   bytes. If 0x3D (=) is the first byte, then
   name will be the empty byte sequence. If it is the last, then
   value will be the empty byte sequence.
1. Otherwise, let name have the value of bytes
   and let value be the empty byte sequence.
1. Replace any 0x2B (+) in name and value with 0x20 (SP).
1. Let nameString and valueString be the result of running [UTF-8
   decode without BOM](https://encoding.spec.whatwg.org/#utf-8-decode-without-bom) on the [percent-decoding](#percent-decode) of
   name and value, respectively.
1. [Append](https://infra.spec.whatwg.org/#list-append) (nameString, valueString) to
   output.
1. Return output.

   
   
### 5.2. `application/x-www-form-urlencoded` serializing

   

    
The
`application/x-www-form-urlencoded` serializer
takes a list of name-value tuples tuples, with an optional [encoding](https://encoding.spec.whatwg.org/#encoding)
encoding (default [UTF-8](https://encoding.spec.whatwg.org/#utf-8)), and then runs these steps. They return an
[ASCII string](https://infra.spec.whatwg.org/#ascii-string).

    

     1. Set encoding to the result of [getting an output encoding](https://encoding.spec.whatwg.org/#get-an-output-encoding) from
 encoding.
1. Let output be the empty string.
1. [For each](https://infra.spec.whatwg.org/#list-iterate) tuple of tuples:

      

       1. [Assert](https://infra.spec.whatwg.org/#assert): tuple’s name and tuple’s value are
   [scalar value strings](https://infra.spec.whatwg.org/#scalar-value-string).
1. Let name be the result of running
   [percent-encode after encoding](#string-percent-encode-after-encoding) with encoding, tuple’s
   name, and the [`application/x-www-form-urlencoded` percent-encode set](#application-x-www-form-urlencoded-percent-encode-set).
1. Let value be the result of running
   [percent-encode after encoding](#string-percent-encode-after-encoding) with encoding, tuple’s
   value, and the [`application/x-www-form-urlencoded` percent-encode set](#application-x-www-form-urlencoded-percent-encode-set).
1. If output is not the empty string, then append U+0026 (&) to
   output.
1. Append name, followed by U+003D (=), followed by value, to
   output.
1. Return output.

   
   
### 5.3. Hooks

   
The
`application/x-www-form-urlencoded` string parser
takes a [scalar value string](https://infra.spec.whatwg.org/#scalar-value-string) input, [UTF-8 encodes](https://encoding.spec.whatwg.org/#utf-8-encode) it, and then returns the
result of [`application/x-www-form-urlencoded` parsing](#concept-urlencoded-parser) it.

   
## 6. API

   
This section uses terminology from Web IDL. Browser user agents must support this
API. JavaScript implementations should support this API. Other user agents or programming languages
are encouraged to use an API suitable to their needs, which might not be this one. [[WEBIDL]](#biblio-webidl)

   
### 6.1. URL class

```
[Exposed=*,
 [LegacyWindowAlias](https://webidl.spec.whatwg.org/#LegacyWindowAlias)=`webkitURL`]
interface `URL` {
  [constructor](#dom-url-url)([USVString](https://webidl.spec.whatwg.org/#idl-USVString) `url`, optional [USVString](https://webidl.spec.whatwg.org/#idl-USVString) `base`);

  static [URL](#url)? [parse](#dom-url-parse)([USVString](https://webidl.spec.whatwg.org/#idl-USVString) `url`, optional [USVString](https://webidl.spec.whatwg.org/#idl-USVString) `base`);
  static [boolean](https://webidl.spec.whatwg.org/#idl-boolean) [canParse](#dom-url-canparse)([USVString](https://webidl.spec.whatwg.org/#idl-USVString) `url`, optional [USVString](https://webidl.spec.whatwg.org/#idl-USVString) `base`);

  stringifier attribute [USVString](https://webidl.spec.whatwg.org/#idl-USVString) [href](#dom-url-href);
  readonly attribute [USVString](https://webidl.spec.whatwg.org/#idl-USVString) [origin](#dom-url-origin);
           attribute [USVString](https://webidl.spec.whatwg.org/#idl-USVString) [protocol](#dom-url-protocol);
           attribute [USVString](https://webidl.spec.whatwg.org/#idl-USVString) [username](#dom-url-username);
           attribute [USVString](https://webidl.spec.whatwg.org/#idl-USVString) [password](#dom-url-password);
           attribute [USVString](https://webidl.spec.whatwg.org/#idl-USVString) [host](#dom-url-host);
           attribute [USVString](https://webidl.spec.whatwg.org/#idl-USVString) [hostname](#dom-url-hostname);
           attribute [USVString](https://webidl.spec.whatwg.org/#idl-USVString) [port](#dom-url-port);
           attribute [USVString](https://webidl.spec.whatwg.org/#idl-USVString) [pathname](#dom-url-pathname);
           attribute [USVString](https://webidl.spec.whatwg.org/#idl-USVString) [search](#dom-url-search);
  [[SameObject](https://webidl.spec.whatwg.org/#SameObject)] readonly attribute [URLSearchParams](#urlsearchparams) [searchParams](#dom-url-searchparams);
           attribute [USVString](https://webidl.spec.whatwg.org/#idl-USVString) [hash](#dom-url-hash);

  [USVString](https://webidl.spec.whatwg.org/#idl-USVString) [toJSON](#dom-url-tojson)();
};

```

   
A `[URL](#url)` object has an associated:

   

    - URL: a [URL](#concept-url).
- query object: a `[URLSearchParams](#urlsearchparams)`
 object.

   

    
The API URL parser takes a [scalar value string](https://infra.spec.whatwg.org/#scalar-value-string) url and an optional
null-or-[scalar value string](https://infra.spec.whatwg.org/#scalar-value-string) base (default null), and then runs these steps:

    

     1. Let parsedBase be null.
1. If base is non-null:

      

       1. Set parsedBase to the result of running the [basic URL parser](#concept-basic-url-parser) on
   base.
1. If parsedBase is failure, then return failure.
1. Return the result of running the [basic URL parser](#concept-basic-url-parser) on url with
 parsedBase.

   
   

    
To initialize a `[URL](#url)` object url with a [URL](#concept-url)
urlRecord:

    

     1. Let query be urlRecord’s [query](#concept-url-query), if that is non-null;
 otherwise the empty string.
1. Set url’s [URL](#concept-url-url) to urlRecord.
1. Set url’s [query object](#concept-url-query-object) to a new `[URLSearchParams](#urlsearchparams)` object.
1. [Initialize](#urlsearchparams-initialize) url’s [query object](#concept-url-query-object) with
 query.
1. Set url’s [query object](#concept-url-query-object)’s [URL object](#concept-urlsearchparams-url-object) to
 url.

   
   

    
Objects implementing the `[URL](#url)` interface’s [extract an origin](https://html.spec.whatwg.org/multipage/browsers.html#extract-an-origin) steps are
to return [this](https://webidl.spec.whatwg.org/#this)’s [URL](#concept-url-url)’s [origin](#concept-url-origin). [[HTML]](#biblio-html)

   
   
---

   

    
The
`new URL(url, base)`
constructor steps are:

    

     1. Let parsedURL be the result of running the [API URL parser](#api-url-parser) on
 url with base, if given.
1. If parsedURL is failure, then [throw](https://webidl.spec.whatwg.org/#dfn-throw) a `[TypeError](https://webidl.spec.whatwg.org/#exceptiondef-typeerror)`.
1. [Initialize](#url-initialize) [this](https://webidl.spec.whatwg.org/#this) with parsedURL.

   
   

    
 
    
To [parse](#concept-basic-url-parser) a string into a [URL](#concept-url) without using a
 [base URL](#concept-base-url), invoke the `[URL](#url)` constructor with a single argument:

```
`var input = "https://example.org/💩",
    url = new URL(input)
url.pathname // "/%F0%9F%92%A9"`
```

    
This throws an exception if the input is a [relative-URL string](#relative-url-string):

```
`try {
  var url = new URL("/🍣🍺")
} catch(e) {
  // that happened
}`
```

    
For those cases a [base URL](#concept-base-url) is necessary:

```
`var input = "/🍣🍺",
    url = new URL(input, document.baseURI)
url.href // "https://url.spec.whatwg.org/%F0%9F%8D%A3%F0%9F%8D%BA"`
```

    
A `[URL](#url)` object can be used as a [base URL](#concept-base-url) (as the IDL requires a string as argument, a
 `[URL](#url)` object stringifies to its `[href](#dom-url-href)` getter return value):

```
`var url = new URL("🏳️‍🌈", new URL("https://pride.example/hello-world"))
url.pathname // "/%F0%9F%8F%B3%EF%B8%8F%E2%80%8D%F0%9F%8C%88"`
```

   
   
---

   

    
The static `parse(url, base)` method
steps are:

    

     1. Let parsedURL be the result of running the [API URL parser](#api-url-parser) on
 url with base, if given.
1. If parsedURL is failure, then return null.
1. Let url be a new `[URL](#url)` object.
1. [Initialize](#url-initialize) url with parsedURL.
1. Return url.

   
   

    
The static `canParse(url, base)`
method steps are:

    

     1. Let parsedURL be the result of running the [API URL parser](#api-url-parser) on
 url with base, if given.
1. If parsedURL is failure, then return false.
1. Return true.

   
   
---

   

    
The `href` getter steps and the
`toJSON()` method steps are to return the
[serialization](#concept-url-serializer) of [this](https://webidl.spec.whatwg.org/#this)’s [URL](#concept-url-url).

   
   

    
The `[href](#dom-url-href)` setter steps are:

    

     1. Let parsedURL be the result of running the [basic URL parser](#concept-basic-url-parser) on the given
 value.
1. If parsedURL is failure, then [throw](https://webidl.spec.whatwg.org/#dfn-throw) a `[TypeError](https://webidl.spec.whatwg.org/#exceptiondef-typeerror)`.
1. Set [this](https://webidl.spec.whatwg.org/#this)’s [URL](#concept-url-url) to parsedURL.
1. Empty [this](https://webidl.spec.whatwg.org/#this)’s [query object](#concept-url-query-object)’s [list](#concept-urlsearchparams-list).
1. Let query be [this](https://webidl.spec.whatwg.org/#this)’s [URL](#concept-url-url)’s [query](#concept-url-query).
1. If query is non-null, then set [this](https://webidl.spec.whatwg.org/#this)’s
 [query object](#concept-url-query-object)’s [list](#concept-urlsearchparams-list) to the result of
 [parsing](#concept-urlencoded-string-parser) query.

   
   

    
The `origin` getter steps are to return the
[serialization](https://html.spec.whatwg.org/multipage/browsers.html#ascii-serialisation-of-an-origin) of [this](https://webidl.spec.whatwg.org/#this)’s [URL](#concept-url-url)’s
[origin](#concept-url-origin). [[HTML]](#biblio-html)

   
   

    
The `protocol` getter steps are to return [this](https://webidl.spec.whatwg.org/#this)’s
[URL](#concept-url-url)’s [scheme](#concept-url-scheme), followed by U+003A (:).

   
   

    
The `[protocol](#dom-url-protocol)` setter steps are to
[basic URL parse](#concept-basic-url-parser) the given value, followed by U+003A (:), with
[this](https://webidl.spec.whatwg.org/#this)’s [URL](#concept-url-url) as [*url*](#basic-url-parser-url) and
[scheme start state](#scheme-start-state) as [*state override*](#basic-url-parser-state-override).

   
   

    
The `username` getter steps are to return [this](https://webidl.spec.whatwg.org/#this)’s
[URL](#concept-url-url)’s [username](#concept-url-username).

   
   

    
The `[username](#dom-url-username)` setter steps are:

    

     1. If [this](https://webidl.spec.whatwg.org/#this)’s [URL](#concept-url-url) [cannot have a username/password/port](#cannot-have-a-username-password-port), then
 return.
1. [Set the username](#set-the-username) given [this](https://webidl.spec.whatwg.org/#this)’s [URL](#concept-url-url) and the given value.

   
   

    
The `password` getter steps are to return [this](https://webidl.spec.whatwg.org/#this)’s
[URL](#concept-url-url)’s [password](#concept-url-password).

   
   

    
The `[password](#dom-url-password)` setter steps are:

    

     1. If [this](https://webidl.spec.whatwg.org/#this)’s [URL](#concept-url-url) [cannot have a username/password/port](#cannot-have-a-username-password-port), then
 return.
1. [Set the password](#set-the-password) given [this](https://webidl.spec.whatwg.org/#this)’s [URL](#concept-url-url) and the given value.

   
   

    
The `host` getter steps are:

    

     1. Let url be [this](https://webidl.spec.whatwg.org/#this)’s [URL](#concept-url-url).
1. If url’s [host](#concept-url-host) is null, then return the empty string.
1. If url’s [port](#concept-url-port) is null, return url’s
 [host](#concept-url-host), [serialized](#concept-host-serializer).
1. Return url’s [host](#concept-url-host), [serialized](#concept-host-serializer),
 followed by U+003A (:) and url’s [port](#concept-url-port),
 [serialized](#serialize-an-integer).

   
   

    
The `[host](#dom-url-host)` setter steps are:

    

     1. If [this](https://webidl.spec.whatwg.org/#this)’s [URL](#concept-url-url) has an [opaque path](#url-opaque-path), then return.
1. [Basic URL parse](#concept-basic-url-parser) the given value with [this](https://webidl.spec.whatwg.org/#this)’s
 [URL](#concept-url-url) as [*url*](#basic-url-parser-url) and [host state](#host-state) as
 [*state override*](#basic-url-parser-state-override).

    
If the given value for the `[host](#dom-url-host)` setter lacks a
[port](#url-port-string), [this](https://webidl.spec.whatwg.org/#this)’s [URL](#concept-url-url)’s [port](#concept-url-port) will not
change. This can be unexpected as `host` getter does return a [URL-port string](#url-port-string) so
one might have assumed the setter to always "reset" both.

   
   

    
The `hostname` getter steps are:

    

     1. If [this](https://webidl.spec.whatwg.org/#this)’s [URL](#concept-url-url)’s [host](#concept-url-host) is null, then return the empty
 string.
1. Return [this](https://webidl.spec.whatwg.org/#this)’s [URL](#concept-url-url)’s [host](#concept-url-host),
 [serialized](#concept-host-serializer).

   
   

    
The `[hostname](#dom-url-hostname)` setter steps are:

    

     1. If [this](https://webidl.spec.whatwg.org/#this)’s [URL](#concept-url-url) has an [opaque path](#url-opaque-path), then return.
1. [Basic URL parse](#concept-basic-url-parser) the given value with [this](https://webidl.spec.whatwg.org/#this)’s
 [URL](#concept-url-url) as [*url*](#basic-url-parser-url) and [hostname state](#hostname-state) as
 [*state override*](#basic-url-parser-state-override).

   
   

    
The `port` getter steps are:

    

     1. If [this](https://webidl.spec.whatwg.org/#this)’s [URL](#concept-url-url)’s [port](#concept-url-port) is null, then return the empty
 string.
1. Return [this](https://webidl.spec.whatwg.org/#this)’s [URL](#concept-url-url)’s [port](#concept-url-port),
 [serialized](#serialize-an-integer).

   
   

    
The `[port](#dom-url-port)` setter steps are:

    

     1. If [this](https://webidl.spec.whatwg.org/#this)’s [URL](#concept-url-url) [cannot have a username/password/port](#cannot-have-a-username-password-port), then
 return.
1. If the given value is the empty string, then set [this](https://webidl.spec.whatwg.org/#this)’s [URL](#concept-url-url)’s
 [port](#concept-url-port) to null.
1. Otherwise, [basic URL parse](#concept-basic-url-parser) the given value with
 [this](https://webidl.spec.whatwg.org/#this)’s [URL](#concept-url-url) as [*url*](#basic-url-parser-url) and
 [port state](#port-state) as [*state override*](#basic-url-parser-state-override).

   
   

    
The `pathname` getter steps are to return the result of
[URL path serializing](#url-path-serializer) [this](https://webidl.spec.whatwg.org/#this)’s [URL](#concept-url-url).

   
   

    
The `[pathname](#dom-url-pathname)` setter steps are:

    

     1. If [this](https://webidl.spec.whatwg.org/#this)’s [URL](#concept-url-url) has an [opaque path](#url-opaque-path), then return.
1. [Empty](https://infra.spec.whatwg.org/#list-empty) [this](https://webidl.spec.whatwg.org/#this)’s [URL](#concept-url-url)’s [path](#concept-url-path).
1. [Basic URL parse](#concept-basic-url-parser) the given value with [this](https://webidl.spec.whatwg.org/#this)’s
 [URL](#concept-url-url) as [*url*](#basic-url-parser-url) and [path start state](#path-start-state) as
 [*state override*](#basic-url-parser-state-override).

   
   

    
The `search` getter steps are:

    

     1. If [this](https://webidl.spec.whatwg.org/#this)’s [URL](#concept-url-url)’s [query](#concept-url-query) is either null or the empty
 string, then return the empty string.
1. Return U+003F (?), followed by [this](https://webidl.spec.whatwg.org/#this)’s [URL](#concept-url-url)’s [query](#concept-url-query).

   
   

    
The `[search](#dom-url-search)` setter steps are:

    

     1. Let url be [this](https://webidl.spec.whatwg.org/#this)’s [URL](#concept-url-url).
1. If the given value is the empty string, then set url’s [query](#concept-url-query) to
 null, [empty](https://infra.spec.whatwg.org/#list-empty) [this](https://webidl.spec.whatwg.org/#this)’s [query object](#concept-url-query-object)’s
 [list](#concept-urlsearchparams-list), and return.
1. Let input be the given value with a single leading U+003F (?) removed, if any.
1. Set url’s [query](#concept-url-query) to the empty string.
1. [Basic URL parse](#concept-basic-url-parser) input with url as
 [*url*](#basic-url-parser-url) and [query state](#query-state) as
 [*state override*](#basic-url-parser-state-override).
1. Set [this](https://webidl.spec.whatwg.org/#this)’s [query object](#concept-url-query-object)’s [list](#concept-urlsearchparams-list) to the
 result of [parsing](#concept-urlencoded-string-parser) input.

   
   

    
The `searchParams` getter steps are to return
[this](https://webidl.spec.whatwg.org/#this)’s [query object](#concept-url-query-object).

   
   

    
The `hash` getter steps are:

    

     1. If [this](https://webidl.spec.whatwg.org/#this)’s [URL](#concept-url-url)’s [fragment](#concept-url-fragment) is either null or the empty
 string, then return the empty string.
1. Return U+0023 (#), followed by [this](https://webidl.spec.whatwg.org/#this)’s [URL](#concept-url-url)’s [fragment](#concept-url-fragment).

   
   

    
The `[hash](#dom-url-hash)` setter steps are:

    

     1. If the given value is the empty string, then set [this](https://webidl.spec.whatwg.org/#this)’s [URL](#concept-url-url)’s
 [fragment](#concept-url-fragment) to null and return.
1. Let input be the given value with a single leading U+0023 (#) removed, if any.
1. Set [this](https://webidl.spec.whatwg.org/#this)’s [URL](#concept-url-url)’s [fragment](#concept-url-fragment) to the empty string.
1. [Basic URL parse](#concept-basic-url-parser) input with [this](https://webidl.spec.whatwg.org/#this)’s
 [URL](#concept-url-url) as [*url*](#basic-url-parser-url) and [fragment state](#fragment-state) as
 [*state override*](#basic-url-parser-state-override).

   
   
### 6.2. URLSearchParams class

```
[Exposed=*]
interface `URLSearchParams` {
  [constructor](#dom-urlsearchparams-urlsearchparams)(optional ([sequence](https://webidl.spec.whatwg.org/#idl-sequence)<[sequence](https://webidl.spec.whatwg.org/#idl-sequence)<[USVString](https://webidl.spec.whatwg.org/#idl-USVString)>> or [record](https://webidl.spec.whatwg.org/#idl-record)<[USVString](https://webidl.spec.whatwg.org/#idl-USVString), [USVString](https://webidl.spec.whatwg.org/#idl-USVString)> or [USVString](https://webidl.spec.whatwg.org/#idl-USVString)) `init` = "");

  readonly attribute [unsigned long](https://webidl.spec.whatwg.org/#idl-unsigned-long) [size](#dom-urlsearchparams-size);

  [undefined](https://webidl.spec.whatwg.org/#idl-undefined) [append](#dom-urlsearchparams-append)([USVString](https://webidl.spec.whatwg.org/#idl-USVString) `name`, [USVString](https://webidl.spec.whatwg.org/#idl-USVString) `value`);
  [undefined](https://webidl.spec.whatwg.org/#idl-undefined) [delete](#dom-urlsearchparams-delete)([USVString](https://webidl.spec.whatwg.org/#idl-USVString) `name`, optional [USVString](https://webidl.spec.whatwg.org/#idl-USVString) `value`);
  [USVString](https://webidl.spec.whatwg.org/#idl-USVString)? [get](#dom-urlsearchparams-get)([USVString](https://webidl.spec.whatwg.org/#idl-USVString) `name`);
  [sequence](https://webidl.spec.whatwg.org/#idl-sequence)<[USVString](https://webidl.spec.whatwg.org/#idl-USVString)> [getAll](#dom-urlsearchparams-getall)([USVString](https://webidl.spec.whatwg.org/#idl-USVString) `name`);
  [boolean](https://webidl.spec.whatwg.org/#idl-boolean) [has](#dom-urlsearchparams-has)([USVString](https://webidl.spec.whatwg.org/#idl-USVString) `name`, optional [USVString](https://webidl.spec.whatwg.org/#idl-USVString) `value`);
  [undefined](https://webidl.spec.whatwg.org/#idl-undefined) [set](#dom-urlsearchparams-set)([USVString](https://webidl.spec.whatwg.org/#idl-USVString) `name`, [USVString](https://webidl.spec.whatwg.org/#idl-USVString) `value`);

  [undefined](https://webidl.spec.whatwg.org/#idl-undefined) [sort](#dom-urlsearchparams-sort)();

  [iterable](https://webidl.spec.whatwg.org/#dfn-iterable)<[USVString](https://webidl.spec.whatwg.org/#idl-USVString), [USVString](https://webidl.spec.whatwg.org/#idl-USVString)>;
  [stringifier](#urlsearchparams-stringification-behavior);
};

```

   

    
 
    
Constructing and stringifying a `[URLSearchParams](#urlsearchparams)` object is fairly straightforward:

```
`let params = new URLSearchParams({key: "730d67"})
params.toString() // "key=730d67"`
```

   
   

    
As a `[URLSearchParams](#urlsearchparams)` object uses the [`application/x-www-form-urlencoded`](#concept-urlencoded)
 format underneath there are some difference with how it encodes certain code points compared to a
 `[URL](#url)` object (including `[href](#dom-url-href)` and `[search](#dom-url-search)`). This can be especially surprising when
 using `[searchParams](#dom-url-searchparams)` to operate on a [URL](#concept-url)’s [query](#concept-url-query).

```
`const url = new URL('https://example.com/?a=b ~');
console.log(url.href);   // "https://example.com/?a=b%20~"
url.searchParams.sort();
console.log(url.href);   // "https://example.com/?a=b+%7E"`
```

```
`const url = new URL('https://example.com/?a=~&b=%7E');
console.log(url.search);                // "?a=~&b=%7E"
console.log(url.searchParams.get('a')); // "~"
console.log(url.searchParams.get('b')); // "~"`
```

    
`[URLSearchParams](#urlsearchparams)` objects will percent-encode anything in the
 [`application/x-www-form-urlencoded` percent-encode set](#application-x-www-form-urlencoded-percent-encode-set), and will encode
 U+0020 SPACE as U+002B (+).

    
Ignoring encodings (use [UTF-8](https://encoding.spec.whatwg.org/#utf-8)), `[search](#dom-url-search)` will percent-encode anything in the
 [query percent-encode set](#query-percent-encode-set) or the [special-query percent-encode set](#special-query-percent-encode-set) (depending on
 whether or not the [URL](#concept-url) [is special](#is-special)).

   
   
A `[URLSearchParams](#urlsearchparams)` object has an associated:

   

    - list: a [list](https://infra.spec.whatwg.org/#list)
 of [tuples](https://infra.spec.whatwg.org/#tuple) each consisting of a name and a value, initially empty.
- URL object: null or
 a `[URL](#url)` object, initially null.

   

    
To initialize a
`[URLSearchParams](#urlsearchparams)` object query with init:

    

     1. If init is a [sequence](https://webidl.spec.whatwg.org/#idl-sequence), then [for each](https://infra.spec.whatwg.org/#list-iterate) innerSequence
  of init:

      

       1. If innerSequence’s [size](https://infra.spec.whatwg.org/#list-size) is not 2, then [throw](https://webidl.spec.whatwg.org/#dfn-throw) a
   `[TypeError](https://webidl.spec.whatwg.org/#exceptiondef-typeerror)`.
1. [Append](https://infra.spec.whatwg.org/#list-append) (innerSequence[0], innerSequence[1]) to
   query’s [list](#concept-urlsearchparams-list).
1. Otherwise, if init is a [record](https://webidl.spec.whatwg.org/#idl-record), then [for each](https://infra.spec.whatwg.org/#map-iterate)
 name → value of init, [append](https://infra.spec.whatwg.org/#list-append) (name,
 value) to query’s [list](#concept-urlsearchparams-list).
1. Otherwise:

      

       1. Assert: init is a string.
1. Set query’s [list](#concept-urlsearchparams-list) to the result of
   [parsing](#concept-urlencoded-string-parser) init.

   
   

    
To update a `[URLSearchParams](#urlsearchparams)`
object query:

    

     1. If query’s [URL object](#concept-urlsearchparams-url-object) is null, then return.
1. Let serializedQuery be the [serialization](#concept-urlencoded-serializer) of
 query’s [list](#concept-urlsearchparams-list).
1. If serializedQuery is the empty string, then set serializedQuery to
 null.
1. Set query’s [URL object](#concept-urlsearchparams-url-object)’s [URL](#concept-url-url)’s
 [query](#concept-url-query) to serializedQuery.

   
   

    
The
`new URLSearchParams(init)`
constructor steps are:

    

     1. If init is a string and starts with U+003F (?), then remove the first code point
 from init.
1. [Initialize](#urlsearchparams-initialize) [this](https://webidl.spec.whatwg.org/#this) with init.

   
   

    
The `size` getter steps are to return
[this](https://webidl.spec.whatwg.org/#this)’s [list](#concept-urlsearchparams-list)’s [size](https://infra.spec.whatwg.org/#list-size).

   
   

    
The `append(name, value)`
method steps are:

    

     1. [Append](https://infra.spec.whatwg.org/#list-append) (name, value) to [this](https://webidl.spec.whatwg.org/#this)’s
 [list](#concept-urlsearchparams-list).
1. [Update](#concept-urlsearchparams-update) [this](https://webidl.spec.whatwg.org/#this).

   
   

    
The `delete(name, value)`
method steps are:

    

     1. If value is given, then [remove](https://infra.spec.whatwg.org/#list-remove) all [tuples](https://infra.spec.whatwg.org/#tuple) whose name
 is name and value is value from [this](https://webidl.spec.whatwg.org/#this)’s
 [list](#concept-urlsearchparams-list).
1. Otherwise, [remove](https://infra.spec.whatwg.org/#list-remove) all [tuples](https://infra.spec.whatwg.org/#tuple) whose name is name from
 [this](https://webidl.spec.whatwg.org/#this)’s [list](#concept-urlsearchparams-list).
1. [Update](#concept-urlsearchparams-update) [this](https://webidl.spec.whatwg.org/#this).

   
   

    
The `get(name)` method steps are to
return the value of the first [tuple](https://infra.spec.whatwg.org/#tuple) whose name is name in [this](https://webidl.spec.whatwg.org/#this)’s
[list](#concept-urlsearchparams-list), if there is such a [tuple](https://infra.spec.whatwg.org/#tuple); otherwise null.

   
   

    
The `getAll(name)` method steps are
to return the values of all [tuples](https://infra.spec.whatwg.org/#tuple) whose name is name in [this](https://webidl.spec.whatwg.org/#this)’s
[list](#concept-urlsearchparams-list), in list order; otherwise the empty sequence.

   
   

    
The `has(name, value)`
method steps are:

    

     1. If value is given and there is a [tuple](https://infra.spec.whatwg.org/#tuple) whose name is name
 and value is value in [this](https://webidl.spec.whatwg.org/#this)’s [list](#concept-urlsearchparams-list), then return true.
1. If value is not given and there is a [tuple](https://infra.spec.whatwg.org/#tuple) whose name is
 name in [this](https://webidl.spec.whatwg.org/#this)’s [list](#concept-urlsearchparams-list), then return true.
1. Return false.

   
   

    
The `set(name, value)`
method steps are:

    

     1. If [this](https://webidl.spec.whatwg.org/#this)’s [list](#concept-urlsearchparams-list) [contains](https://infra.spec.whatwg.org/#list-contain) any
 [tuples](https://infra.spec.whatwg.org/#tuple) whose name is name, then set the value of the first such
 [tuple](https://infra.spec.whatwg.org/#tuple) to value and [remove](https://infra.spec.whatwg.org/#list-remove) the others.
1. Otherwise, [append](https://infra.spec.whatwg.org/#list-append) (name, value) to [this](https://webidl.spec.whatwg.org/#this)’s
 [list](#concept-urlsearchparams-list).
1. [Update](#concept-urlsearchparams-update) [this](https://webidl.spec.whatwg.org/#this).

   
   
---

   

    
 
    
It can be useful to sort the name-value tuples in a `[URLSearchParams](#urlsearchparams)` object, in particular to
 increase cache hits. This can be accomplished through invoking the
 `[sort()](#dom-urlsearchparams-sort)` method:

```
`const url = new URL("https://example.org/?q=🏳️‍🌈&key=e1f7bc78");
url.searchParams.sort();
url.search; // "?key=e1f7bc78&q=%F0%9F%8F%B3%EF%B8%8F%E2%80%8D%F0%9F%8C%88"`
```

    
To avoid altering the original input, e.g., for comparison purposes, construct a new
 `[URLSearchParams](#urlsearchparams)` object:

```
`const sorted = new URLSearchParams(url.search)
sorted.sort()`
```

   
   

    
The `sort()` method steps are:

    

     1. Set [this](https://webidl.spec.whatwg.org/#this)’s [list](#concept-urlsearchparams-list) to the result of
 [sorting in ascending order](https://infra.spec.whatwg.org/#list-sort-in-ascending-order) [this](https://webidl.spec.whatwg.org/#this)’s [list](#concept-urlsearchparams-list),
 with a being less than b if a’s name is [code unit less than](https://infra.spec.whatwg.org/#code-unit-less-than) b’s name.
1. [Update](#concept-urlsearchparams-update) [this](https://webidl.spec.whatwg.org/#this).

   
   
---

   
The [value pairs to iterate over](https://webidl.spec.whatwg.org/#dfn-value-pairs-to-iterate-over) are [this](https://webidl.spec.whatwg.org/#this)’s [list](#concept-urlsearchparams-list)’s
[tuples](https://infra.spec.whatwg.org/#tuple) with the key being the name and the value being the value.

   
The stringification behavior steps are to return the
[serialization](#concept-urlencoded-serializer) of [this](https://webidl.spec.whatwg.org/#this)’s [list](#concept-urlsearchparams-list).

   
### 6.3. URL APIs elsewhere

   
A standard that exposes [URLs](#concept-url), should expose the [URL](#concept-url) as a string (by
[serializing](#concept-url-serializer) an internal [URL](#concept-url)). A standard should not expose a
[URL](#concept-url) using a `[URL](#url)` object. `[URL](#url)` objects are meant for [URL](#concept-url)
manipulation. In IDL the USVString type should be used.

   
The higher-level notion here is that values are to be exposed as immutable data
structures.

   
If a standard decides to use a variant of the name "URL" for a feature it defines, it should name
such a feature "url" (i.e., lowercase and with an "l" at the end). Names such as "URL", "URI", and
"IRI" should not be used. However, if the name is a compound, "URL" (i.e., uppercase) is preferred,
e.g., "newURL" and "oldURL".

   
The `[EventSource](https://html.spec.whatwg.org/multipage/server-sent-events.html#eventsource)` and `[HashChangeEvent](https://html.spec.whatwg.org/multipage/nav-history-apis.html#hashchangeevent)` interfaces in HTML are
examples of proper naming. [[HTML]](#biblio-html)

   
## Acknowledgments

   
There have been a lot of people that have helped make [URLs](#concept-url) more interoperable over
the years and thereby furthered the goals of this standard. Likewise many people have helped making
this standard what it is today.

   
With that, many thanks to
100の人,
Adam Barth,
Addison Phillips,
Adrián Chaves,
Adrien Ricciardi,
Albert Wiersch,
Alex Christensen,
Alexandre Morgaut,
Alexis Hunt,
Alwin Blok,
Andrew Sullivan,
Arkadiusz Michalski,
Behnam Esfahbod,
Bobby Holley,
Boris Zbarsky,
Brad Hill,
Brandon Ross,
Cailyn Hansen,
Chris Dumez,
Chris Rebert,
Corey Farwell,
Dan Appelquist,
Daniel Bratell,
Daniel Stenberg,
David Burns,
David Håsäther,
David Sheets,
David Singer,
David Walp,
Domenic Denicola,
Emily Schechter,
Emily Stark,
Eric Lawrence,
Erik Arvidsson,
Gavin Carothers,
Geoff Richards,
Glenn Maynard,
Gordon P. Hemsley,
hemanth,
Henri Sivonen,
Ian Hickson,
Ilya Grigorik,
Italo A. Casas,
Jakub Gieryluk,
James C. Wise,
James Graham,
James Manger,
James Ross,
Jeff Hodges,
Jeffrey Posnick,
Jeffrey Yasskin,
Joe Duarte,
Joshua Bell,
Jxck,
Karl Wagner,
Kemal Zebari,
田村健人 (Kent TAMURA),
Kevin Grandon,
Kornel Lesiński,
Larry Masinter,
Leif Halvard Silli,
Mark Amery,
Mark Davis,
Marcos Cáceres,
Marijn Kruisselbrink,
Martin Dürst,
Mathias Bynens,
Matt Falkenhagen,
Matt Giuca,
Michael Peick,
Michael™ Smith,
Michal Bukovský,
Michel Suignard,
Mikaël Geljić,
Nikita Skovoroda,
Noah Levitt,
Peter Occil,
Philip Jägenstedt,
Philippe Ombredanne,
Prayag Verma,
Rimas Misevičius,
Robert Kieffer,
Rodney Rehm,
Roy Fielding,
Ryan Sleevi,
Sam Ruby,
Sam Sneddon,
Santiago M. Mola,
Sebastian Mayr,
Shannon Booth,
Simon Pieters,
Simon Sapin,
Steven Vachon,
Stuart Cook,
Sven Uhlig,
Tab Atkins,
吉野剛史 (Takeshi Yoshino),
Tantek Çelik,
Tiancheng "Timothy" Gu,
Tim Berners-Lee,
簡冠庭 (Tim Guan-tin Chien),
Titi_Alone,
Tomek Wytrębowicz,
Trevor Rowbotham,
Tristan Seligmann,
Valentin Gosu,
Vyacheslav Matva,
Wei Wang,
Wolf Lammen,
山岸和利 (Yamagishi Kazutoshi),
Yongsheng Zhang,
成瀬ゆい (Yui Naruse), and
zealousidealroll
for being awesome!

   
This standard is written by [Anne van Kesteren](https://annevankesteren.nl/)
([Apple](https://www.apple.com/), [annevk@annevk.nl](mailto:annevk@annevk.nl)).

   
## Intellectual property rights

   
Copyright © WHATWG (Apple, Google, Mozilla, Microsoft). This work is licensed under a [Creative Commons Attribution 4.0
International License](https://creativecommons.org/licenses/by/4.0/). To the extent portions of it are incorporated into source code, such
portions in the source code are licensed under the [BSD 3-Clause License](https://opensource.org/licenses/BSD-3-Clause) instead.

   
This is the Living Standard. Those
interested in the patent-review version should view the
[Living Standard Review Draft](/review-drafts/2026-08/).

  

  
## Index

  
### Terms defined by this specification

  

   - [absolute-URL string](#absolute-url-string), in § 4.3
- [absolute-URL-with-fragment string](#absolute-url-with-fragment-string), in § 4.3
- [API URL parser](#api-url-parser), in § 6.1
- [append(name, value)](#dom-urlsearchparams-append), in § 6.2
- [application/x-www-form-urlencoded](#concept-urlencoded), in § 5
- [application/x-www-form-urlencoded percent-encode set](#application-x-www-form-urlencoded-percent-encode-set), in § 1.3
- [authority state](#authority-state), in § 4.4
- [base URL](#concept-base-url), in § 4.2
- [basic URL parser](#concept-basic-url-parser), in § 4.4
- [blob URL entry](#concept-url-blob-entry), in § 4.1
- [c](#c), in § 1.2
- [C0 control percent-encode set](#c0-control-percent-encode-set), in § 1.3
- [cannot have a username/password/port](#cannot-have-a-username-password-port), in § 4.2
- [canParse(url)](#dom-url-canparse), in § 6.1
- [canParse(url, base)](#dom-url-canparse), in § 6.1
- [component percent-encode set](#component-percent-encode-set), in § 1.3
- [constructor()](#dom-urlsearchparams-urlsearchparams), in § 6.2
- [constructor(init)](#dom-urlsearchparams-urlsearchparams), in § 6.2
- [constructor(url)](#dom-url-url), in § 6.1
- [constructor(url, base)](#dom-url-url), in § 6.1
- [default port](#default-port), in § 4.2
- [delete(name)](#dom-urlsearchparams-delete), in § 6.2
- [delete(name, value)](#dom-urlsearchparams-delete), in § 6.2
- [domain](#concept-domain), in § 3.1
- [domain label](#domain-label), in § 3.1
- [domain parser](#concept-domain-to-ascii), in § 3.3
- [domain parser ToASCII](#domain-parser-toascii), in § 3.3
- [domain-percent-encoded](#domain-percent-encoded), in § 1.1
- [domain-to-ASCII](#validation-error-domain-to-ascii), in § 1.1
- [domain to Unicode](#concept-domain-to-unicode), in § 3.3
- [double-dot URL path segment](#double-dot-path-segment), in § 4.1
- [effective piece length](#effective-piece-length), in § 3.4
- [empty host](#empty-host), in § 3.1
- [ends in a number checker](#ends-in-a-number-checker), in § 3.5
- [EOF code point](#eof-code-point), in § 1.2
- equal
    

     - [dfn for host](#concept-host-equals), in § 3.7
- [dfn for url](#concept-url-equals), in § 4.6
- [exclude fragment](#url-serializer-exclude-fragment), in § 4.5
- [exclude fragments](#url-equals-exclude-fragments), in § 4.6
- [file host state](#file-host-state), in § 4.4
- [file-invalid-Windows-drive-letter](#file-invalid-windows-drive-letter), in § 1.1
- [file-invalid-Windows-drive-letter-host](#file-invalid-windows-drive-letter-host), in § 1.1
- [file slash state](#file-slash-state), in § 4.4
- [file state](#file-state), in § 4.4
- [find the IPv6 address compressed piece index](#find-the-ipv6-address-compressed-piece-index), in § 3.6
- [forbidden domain code point](#forbidden-domain-code-point), in § 3.2
- [forbidden host code point](#forbidden-host-code-point), in § 3.2
- [fragment](#concept-url-fragment), in § 4.1
- [fragment percent-encode set](#fragment-percent-encode-set), in § 1.3
- [fragment state](#fragment-state), in § 4.4
- [getAll(name)](#dom-urlsearchparams-getall), in § 6.2
- [get(name)](#dom-urlsearchparams-get), in § 6.2
- [hash](#dom-url-hash), in § 6.1
- [has(name)](#dom-urlsearchparams-has), in § 6.2
- [has(name, value)](#dom-urlsearchparams-has), in § 6.2
- host
    

     - [attribute for URL](#dom-url-host), in § 6.1
- [definition of](#concept-host), in § 3.1
- [dfn for url](#concept-url-host), in § 4.1
- [host-invalid-code-point](#host-invalid-code-point), in § 1.1
- [host-missing](#host-missing), in § 1.1
- [hostname](#dom-url-hostname), in § 6.1
- [hostname state](#hostname-state), in § 4.4
- [host parser](#concept-host-parser), in § 3.5
- [host parsing](#concept-host-parser), in § 3.5
- [host serializer](#concept-host-serializer), in § 3.6
- [host state](#host-state), in § 4.4
- [href](#dom-url-href), in § 6.1
- [include credentials](#include-credentials), in § 4.2
- [includes credentials](#include-credentials), in § 4.2
- initialize
    

     - [dfn for URL](#url-initialize), in § 6.1
- [dfn for URLSearchParams](#urlsearchparams-initialize), in § 6.2
- [invalid-credentials](#invalid-credentials), in § 1.1
- [invalid-reverse-solidus](#invalid-reverse-solidus), in § 1.1
- [invalid-URL-unit](#invalid-url-unit), in § 1.1
- [IP address](#ip-address), in § 3.1
- [IPv4 address](#concept-ipv4), in § 3.1
- [IPv4-empty-part](#ipv4-empty-part), in § 1.1
- [IPv4-in-IPv6-invalid-code-point](#ipv4-in-ipv6-invalid-code-point), in § 1.1
- [IPv4-in-IPv6-out-of-range-part](#ipv4-in-ipv6-out-of-range-part), in § 1.1
- [IPv4-in-IPv6-too-few-parts](#ipv4-in-ipv6-too-few-parts), in § 1.1
- [IPv4-in-IPv6-too-many-pieces](#ipv4-in-ipv6-too-many-pieces), in § 1.1
- [IPv4-non-ASCII-input](#ipv4-non-ascii-input), in § 1.1
- [IPv4-non-decimal-part](#ipv4-non-decimal-part), in § 1.1
- [IPv4-non-numeric-part](#ipv4-non-numeric-part), in § 1.1
- [IPv4 number parser](#ipv4-number-parser), in § 3.5
- [IPv4-out-of-range-part](#ipv4-out-of-range-part), in § 1.1
- [IPv4 parser](#concept-ipv4-parser), in § 3.5
- [IPv4 serializer](#concept-ipv4-serializer), in § 3.6
- [IPv4-too-few-parts](#ipv4-too-few-parts), in § 1.1
- [IPv4-too-many-parts](#ipv4-too-many-parts), in § 1.1
- [IPv6 address](#concept-ipv6), in § 3.1
- [IPv6-invalid-code-point](#ipv6-invalid-code-point), in § 1.1
- [IPv6-invalid-compression](#ipv6-invalid-compression), in § 1.1
- [IPv6-multiple-compression](#ipv6-multiple-compression), in § 1.1
- [IPv6 parser](#concept-ipv6-parser), in § 3.5
- [IPv6-piece-leading-zero](#ipv6-piece-leading-zero), in § 1.1
- [IPv6 serializer](#concept-ipv6-serializer), in § 3.6
- [IPv6-too-few-pieces](#ipv6-too-few-pieces), in § 1.1
- [IPv6-too-many-pieces](#ipv6-too-many-pieces), in § 1.1
- [IPv6-unclosed](#ipv6-unclosed), in § 1.1
- [is not special](#is-not-special), in § 4.2
- [is special](#is-special), in § 4.2
- [list](#concept-urlsearchparams-list), in § 6.2
- [missing-scheme-non-relative-URL](#missing-scheme-non-relative-url), in § 1.1
- [normalized Windows drive letter](#normalized-windows-drive-letter), in § 4.2
- [no scheme state](#no-scheme-state), in § 4.4
- [opaque host](#opaque-host), in § 3.1
- [opaque-host-and-port string](#opaque-host-and-port-string), in § 4.3
- [opaque-host parser](#concept-opaque-host-parser), in § 3.5
- [opaque path](#url-opaque-path), in § 4.2
- [opaque path state](#cannot-be-a-base-url-path-state), in § 4.4
- [opaque-path-URL string](#opaque-path-url-string), in § 4.3
- origin
    

     - [attribute for URL](#dom-url-origin), in § 6.1
- [dfn for url](#concept-url-origin), in § 4.7
- [parse(url)](#dom-url-parse), in § 6.1
- [parse(url, base)](#dom-url-parse), in § 6.1
- password
    

     - [attribute for URL](#dom-url-password), in § 6.1
- [dfn for url](#concept-url-password), in § 4.1
- [path](#concept-url-path), in § 4.1
- [path-absolute-non-authority-URL string](#path-absolute-non-authority-url-string), in § 4.3
- [path-absolute-URL string](#path-absolute-url-string), in § 4.3
- [pathname](#dom-url-pathname), in § 6.1
- [path or authority state](#path-or-authority-state), in § 4.4
- [path percent-encode set](#path-percent-encode-set), in § 1.3
- [path-relative-scheme-less-URL string](#path-relative-scheme-less-url-string), in § 4.3
- [path-relative-URL string](#path-relative-url-string), in § 4.3
- [path start state](#path-start-state), in § 4.4
- [path state](#path-state), in § 4.4
- percent-decode
    

     - [dfn for byte sequence](#percent-decode), in § 1.3
- [dfn for string](#string-percent-decode), in § 1.3
- [percent-encode](#percent-encode), in § 1.3
- [percent-encode after encoding](#string-percent-encode-after-encoding), in § 1.3
- [percent-encoded byte](#percent-encoded-byte), in § 1.3
- [percent-encode set](#percent-encode-set), in § 1.3
- [pieces](#concept-ipv6-piece), in § 3.1
- [pointer](#pointer), in § 1.2
- port
    

     - [attribute for URL](#dom-url-port), in § 6.1
- [dfn for url](#concept-url-port), in § 4.1
- [port-invalid](#port-invalid), in § 1.1
- [port-out-of-range](#port-out-of-range), in § 1.1
- [port state](#port-state), in § 4.4
- [protocol](#dom-url-protocol), in § 6.1
- [public suffix](#host-public-suffix), in § 3.2
- [query](#concept-url-query), in § 4.1
- [query object](#concept-url-query-object), in § 6.1
- [query percent-encode set](#query-percent-encode-set), in § 1.3
- [query state](#query-state), in § 4.4
- [registrable domain](#host-registrable-domain), in § 3.2
- [relative slash state](#relative-slash-state), in § 4.4
- [relative state](#relative-state), in § 4.4
- [relative-URL string](#relative-url-string), in § 4.3
- [relative-URL-with-fragment string](#relative-url-with-fragment-string), in § 4.3
- [remaining](#remaining), in § 1.2
- [scheme](#concept-url-scheme), in § 4.1
- [scheme-relative-file-URL string](#scheme-relative-file-url-string), in § 4.3
- [scheme-relative-special-URL string](#scheme-relative-special-url-string), in § 4.3
- [scheme-relative-URL string](#scheme-relative-url-string), in § 4.3
- [scheme start state](#scheme-start-state), in § 4.4
- [scheme state](#scheme-state), in § 4.4
- [search](#dom-url-search), in § 6.1
- [searchParams](#dom-url-searchparams), in § 6.1
- [serialize an integer](#serialize-an-integer), in § 1
- [set(name, value)](#dom-urlsearchparams-set), in § 6.2
- [set the password](#set-the-password), in § 4.4
- [set the username](#set-the-username), in § 4.4
- [shorten](#shorten-a-urls-path), in § 4.2
- [shorten a url’s path](#shorten-a-urls-path), in § 4.2
- [single-dot URL path segment](#single-dot-path-segment), in § 4.1
- [size](#dom-urlsearchparams-size), in § 6.2
- [sort()](#dom-urlsearchparams-sort), in § 6.2
- [special authority ignore slashes state](#special-authority-ignore-slashes-state), in § 4.4
- [special authority slashes state](#special-authority-slashes-state), in § 4.4
- [special-query percent-encode set](#special-query-percent-encode-set), in § 1.3
- [special relative or authority state](#special-relative-or-authority-state), in § 4.4
- [special scheme](#special-scheme), in § 4.2
- [special-scheme-missing-following-solidus](#special-scheme-missing-following-solidus), in § 1.1
- [starts with a Windows drive letter](#start-with-a-windows-drive-letter), in § 4.2
- [start with a Windows drive letter](#start-with-a-windows-drive-letter), in § 4.2
- [state override](#basic-url-parser-state-override), in § 4.4
- [stringification behavior](#URL-stringification-behavior), in § 6.1
- [stringificationbehavior](#urlsearchparams-stringification-behavior), in § 6.2
- [toJSON()](#dom-url-tojson), in § 6.1
- [update](#concept-urlsearchparams-update), in § 6.2
- URL
    

     - [(interface)](#url), in § 6.1
- [definition of](#concept-url), in § 4.1
- [dfn for URL](#concept-url-url), in § 6.1
- [url](#basic-url-parser-url), in § 4.4
- [URL code point](#url-code-points), in § 4.3
- [urlencoded parser](#concept-urlencoded-parser), in § 5.1
- [urlencoded serializer](#concept-urlencoded-serializer), in § 5.2
- [urlencoded string parser](#concept-urlencoded-string-parser), in § 5.3
- [URL-fragment string](#url-fragment-string), in § 4.3
- [URL object](#concept-urlsearchparams-url-object), in § 6.2
- [URL parser](#concept-url-parser), in § 4.4
- [URL path](#url-path), in § 4.1
- [URL path segment](#url-path-segment), in § 4.1
- [URL-path-segment string](#url-path-segment-string), in § 4.3
- [URL path serializer](#url-path-serializer), in § 4.5
- [URL path serializing](#url-path-serializer), in § 4.5
- [URL-port string](#url-port-string), in § 4.3
- [URL-query string](#url-query-string), in § 4.3
- [URL record](#concept-url), in § 4.1
- [URL-scheme string](#url-scheme-string), in § 4.3
- [URLSearchParams](#urlsearchparams), in § 6.2
- [URLSearchParams()](#dom-urlsearchparams-urlsearchparams), in § 6.2
- [URLSearchParams(init)](#dom-urlsearchparams-urlsearchparams), in § 6.2
- [URL serializer](#concept-url-serializer), in § 4.5
- [URL units](#url-units), in § 4.3
- [URL(url)](#dom-url-url), in § 6.1
- [URL(url, base)](#dom-url-url), in § 6.1
- [userinfo percent-encode set](#userinfo-percent-encode-set), in § 1.3
- username
    

     - [attribute for URL](#dom-url-username), in § 6.1
- [dfn for url](#concept-url-username), in § 4.1
- UTF-8 percent-encode
    

     - [dfn for code point](#utf-8-percent-encode), in § 1.3
- [dfn for string](#string-utf-8-percent-encode), in § 1.3
- [validation error](#validation-error), in § 1.1
- [valid domain](#valid-domain), in § 3.4
- [valid domain string](#valid-domain-string), in § 3.4
- [valid host string](#valid-host-string), in § 3.4
- [valid IPv4-address string](#valid-ipv4-address-string), in § 3.4
- [valid IPv6-address string](#valid-ipv6-address-string), in § 3.4
- [valid IPv6-pieces-and-IPv4 string](#valid-ipv6-pieces-and-ipv4-string), in § 3.4
- [valid IPv6-pieces string](#valid-ipv6-pieces-string), in § 3.4
- [valid IPv6-piece string](#valid-ipv6-piece-string), in § 3.4
- [valid opaque-host string](#valid-opaque-host-string), in § 3.4
- [valid URL string](#valid-url-string), in § 4.3
- [webkitURL](#webkiturl), in § 6.1
- [Windows drive letter](#windows-drive-letter), in § 4.2

  
### Terms defined by reference

  

   - [ECMA-262] defines the following terms:
    

     - "encodeURIComponent() [sic]"
- [ENCODING] defines the following terms:
    

     - encode or fail
- encoding
- get an output encoding
- getting an encoder
- I/O queue
- ISO-2022-JP
- ISO-2022-JP encoder
- Shift_JIS
- UTF-8
- UTF-8 decode without BOM
- UTF-8 decode without BOM or fail
- UTF-8 encode
- [FILEAPI] defines the following terms:
    

     - blob URL entry
- blob URL store
- environment
- resolve a blob URL
- [HTML] defines the following terms:
    

     - EventSource
- HashChangeEvent
- Location
- extract an origin
- opaque origin
- origin
- origin (for environment settings object)
- protocol
- registerProtocolHandler(scheme, url)
- same origin
- same site
- schemelessly same site
- serialization of an origin
- tuple origin
- [INFRA] defines the following terms:
    

     - 128-bit unsigned integer
- 16-bit unsigned integer
- 32-bit unsigned integer
- append
- ASCII alpha
- ASCII alphanumeric
- ASCII byte
- ASCII case-insensitive
- ASCII code point
- ASCII digit
- ASCII hex digit
- ASCII lowercase
- ASCII string
- ASCII tab or newline
- ASCII upper hex digit
- assert
- break
- byte
- byte sequence
- c0 control
- c0 control or space
- clone
- code point
- code point length
- code point substring to the end of the string
- code unit less than
- contain
- continue
- empty
- ends with
- for each (for list)
- for each (for map)
- indices
- is empty
- isomorphic decode
- item
- length
- list
- noncharacter
- remove
- scalar value
- scalar value string
- set
- size
- sorting in ascending order
- strictly split
- string
- struct
- surrogate
- tuple
- value (for byte)
- value (for code point)
- [UTS46] defines the following terms:
    

     - ToASCII
- ToUnicode
- [WEBIDL] defines the following terms:
    

     - LegacyWindowAlias
- SameObject
- TypeError
- USVString
- boolean
- iterable
- record
- sequence
- this
- throw
- undefined
- unsigned long
- value pairs to iterate over

  
## References

  
### Normative References

  
   [BIDI]
   Manish Goregaokar मनीष गोरेगांवकर; Robin Leroy. [Unicode Bidirectional Algorithm](https://www.unicode.org/reports/tr9/tr9-51.html). 13 August 2025. Unicode Standard Annex #9. URL: [https://www.unicode.org/reports/tr9/tr9-51.html](https://www.unicode.org/reports/tr9/tr9-51.html)
   [ENCODING]
   Anne van Kesteren. [Encoding Standard](https://encoding.spec.whatwg.org/). Living Standard. URL: [https://encoding.spec.whatwg.org/](https://encoding.spec.whatwg.org/)
   [FILEAPI]
   Marijn Kruisselbrink. [File API](https://w3c.github.io/FileAPI/). URL: [https://w3c.github.io/FileAPI/](https://w3c.github.io/FileAPI/)
   [HTML]
   Anne van Kesteren; et al. [HTML Standard](https://html.spec.whatwg.org/multipage/). Living Standard. URL: [https://html.spec.whatwg.org/multipage/](https://html.spec.whatwg.org/multipage/)
   [IANA-URI-SCHEMES]
   [Uniform Resource Identifier (URI) Schemes](https://www.iana.org/assignments/uri-schemes/uri-schemes.xhtml). URL: [https://www.iana.org/assignments/uri-schemes/uri-schemes.xhtml](https://www.iana.org/assignments/uri-schemes/uri-schemes.xhtml)
   [INFRA]
   Anne van Kesteren; Domenic Denicola. [Infra Standard](https://infra.spec.whatwg.org/). Living Standard. URL: [https://infra.spec.whatwg.org/](https://infra.spec.whatwg.org/)
   [PSL]
   [Public Suffix List](https://publicsuffix.org/). URL: [https://publicsuffix.org/](https://publicsuffix.org/)
   [UTS46]
   Mark Davis; Markus Scherer. [Unicode IDNA Compatibility Processing](https://www.unicode.org/reports/tr46/tr46-35.html). 4 September 2025. Unicode Technical Standard #46. URL: [https://www.unicode.org/reports/tr46/tr46-35.html](https://www.unicode.org/reports/tr46/tr46-35.html)
   [WEBIDL]
   Edgar Chen; Timothy Gu. [Web IDL Standard](https://webidl.spec.whatwg.org/). Living Standard. URL: [https://webidl.spec.whatwg.org/](https://webidl.spec.whatwg.org/)
  
  
### Non-Normative References

  
   [ECMA-262]
   [ECMAScript Language Specification](https://tc39.es/ecma262/multipage/). URL: [https://tc39.es/ecma262/multipage/](https://tc39.es/ecma262/multipage/)
   [IDNFAQ]
   [Internationalized Domain Names (IDN) FAQ](https://unicode.org/faq/idn.html). URL: [https://unicode.org/faq/idn.html](https://unicode.org/faq/idn.html)
   [RFC1034]
   P. Mockapetris. [Domain names - concepts and facilities](https://www.rfc-editor.org/info/rfc1034/). November 1987. Internet Standard. URL: [https://www.rfc-editor.org/info/rfc1034/](https://www.rfc-editor.org/info/rfc1034/)
   [RFC3986]
   T. Berners-Lee; R. Fielding; L. Masinter. [Uniform Resource Identifier (URI): Generic Syntax](https://www.rfc-editor.org/info/rfc3986/). January 2005. Internet Standard. URL: [https://www.rfc-editor.org/info/rfc3986/](https://www.rfc-editor.org/info/rfc3986/)
   [RFC3987]
   M. Duerst; M. Suignard. [Internationalized Resource Identifiers (IRIs)](https://www.rfc-editor.org/info/rfc3987/). January 2005. Proposed Standard. URL: [https://www.rfc-editor.org/info/rfc3987/](https://www.rfc-editor.org/info/rfc3987/)
   [RFC4291]
   R. Hinden; S. Deering. [IP Version 6 Addressing Architecture](https://www.rfc-editor.org/info/rfc4291/). February 2006. Draft Standard. URL: [https://www.rfc-editor.org/info/rfc4291/](https://www.rfc-editor.org/info/rfc4291/)
   [RFC5890]
   J. Klensin. [Internationalized Domain Names for Applications (IDNA): Definitions and Document Framework](https://www.rfc-editor.org/info/rfc5890/). August 2010. Proposed Standard. URL: [https://www.rfc-editor.org/info/rfc5890/](https://www.rfc-editor.org/info/rfc5890/)
   [RFC5952]
   S. Kawamura; M. Kawashima. [A Recommendation for IPv6 Address Text Representation](https://www.rfc-editor.org/info/rfc5952/). August 2010. Proposed Standard. URL: [https://www.rfc-editor.org/info/rfc5952/](https://www.rfc-editor.org/info/rfc5952/)
   [RFC6454]
   A. Barth. [The Web Origin Concept](https://www.rfc-editor.org/info/rfc6454/). December 2011. Proposed Standard. URL: [https://www.rfc-editor.org/info/rfc6454/](https://www.rfc-editor.org/info/rfc6454/)
   [RFC7595]
   D. Thaler, Ed.; T. Hansen; T. Hardie. [Guidelines and Registration Procedures for URI Schemes](https://www.rfc-editor.org/info/rfc7595/). June 2015. Best Current Practice. URL: [https://www.rfc-editor.org/info/rfc7595/](https://www.rfc-editor.org/info/rfc7595/)
   [RFC791]
   J. Postel. [Internet Protocol](https://www.rfc-editor.org/info/rfc791/). September 1981. Internet Standard. URL: [https://www.rfc-editor.org/info/rfc791/](https://www.rfc-editor.org/info/rfc791/)
   [UTR36]
   Mark Davis; Michel Suignard. [Unicode Security Considerations](https://www.unicode.org/reports/tr36/tr36-15.html). 19 September 2014. Unicode Technical Report #36. URL: [https://www.unicode.org/reports/tr36/tr36-15.html](https://www.unicode.org/reports/tr36/tr36-15.html)
   [UTS39]
   Mark Davis; Michel Suignard. [Unicode Security Mechanisms](https://www.unicode.org/reports/tr39/tr39-32.html). 4 September 2025. Unicode Technical Standard #39. URL: [https://www.unicode.org/reports/tr39/tr39-32.html](https://www.unicode.org/reports/tr39/tr39-32.html)
  
  
## IDL Index

```
[Exposed=*,
 [LegacyWindowAlias](https://webidl.spec.whatwg.org/#LegacyWindowAlias)=[`webkitURL`](#webkiturl)]
interface [`URL`](#url) {
  [constructor](#dom-url-url)([USVString](https://webidl.spec.whatwg.org/#idl-USVString) [`url`](#dom-url-url-url-base-url), optional [USVString](https://webidl.spec.whatwg.org/#idl-USVString) [`base`](#dom-url-url-url-base-base));

  static [URL](#url)? [parse](#dom-url-parse)([USVString](https://webidl.spec.whatwg.org/#idl-USVString) [`url`](#dom-url-parse-url-base-url), optional [USVString](https://webidl.spec.whatwg.org/#idl-USVString) [`base`](#dom-url-parse-url-base-base));
  static [boolean](https://webidl.spec.whatwg.org/#idl-boolean) [canParse](#dom-url-canparse)([USVString](https://webidl.spec.whatwg.org/#idl-USVString) [`url`](#dom-url-canparse-url-base-url), optional [USVString](https://webidl.spec.whatwg.org/#idl-USVString) [`base`](#dom-url-canparse-url-base-base));

  [stringifier](#URL-stringification-behavior) attribute [USVString](https://webidl.spec.whatwg.org/#idl-USVString) [href](#dom-url-href);
  readonly attribute [USVString](https://webidl.spec.whatwg.org/#idl-USVString) [origin](#dom-url-origin);
           attribute [USVString](https://webidl.spec.whatwg.org/#idl-USVString) [protocol](#dom-url-protocol);
           attribute [USVString](https://webidl.spec.whatwg.org/#idl-USVString) [username](#dom-url-username);
           attribute [USVString](https://webidl.spec.whatwg.org/#idl-USVString) [password](#dom-url-password);
           attribute [USVString](https://webidl.spec.whatwg.org/#idl-USVString) [host](#dom-url-host);
           attribute [USVString](https://webidl.spec.whatwg.org/#idl-USVString) [hostname](#dom-url-hostname);
           attribute [USVString](https://webidl.spec.whatwg.org/#idl-USVString) [port](#dom-url-port);
           attribute [USVString](https://webidl.spec.whatwg.org/#idl-USVString) [pathname](#dom-url-pathname);
           attribute [USVString](https://webidl.spec.whatwg.org/#idl-USVString) [search](#dom-url-search);
  [[SameObject](https://webidl.spec.whatwg.org/#SameObject)] readonly attribute [URLSearchParams](#urlsearchparams) [searchParams](#dom-url-searchparams);
           attribute [USVString](https://webidl.spec.whatwg.org/#idl-USVString) [hash](#dom-url-hash);

  [USVString](https://webidl.spec.whatwg.org/#idl-USVString) [toJSON](#dom-url-tojson)();
};

[Exposed=*]
interface [`URLSearchParams`](#urlsearchparams) {
  [constructor](#dom-urlsearchparams-urlsearchparams)(optional ([sequence](https://webidl.spec.whatwg.org/#idl-sequence)<[sequence](https://webidl.spec.whatwg.org/#idl-sequence)<[USVString](https://webidl.spec.whatwg.org/#idl-USVString)>> or [record](https://webidl.spec.whatwg.org/#idl-record)<[USVString](https://webidl.spec.whatwg.org/#idl-USVString), [USVString](https://webidl.spec.whatwg.org/#idl-USVString)> or [USVString](https://webidl.spec.whatwg.org/#idl-USVString)) [`init`](#dom-urlsearchparams-urlsearchparams-init-init) = "");

  readonly attribute [unsigned long](https://webidl.spec.whatwg.org/#idl-unsigned-long) [size](#dom-urlsearchparams-size);

  [undefined](https://webidl.spec.whatwg.org/#idl-undefined) [append](#dom-urlsearchparams-append)([USVString](https://webidl.spec.whatwg.org/#idl-USVString) [`name`](#dom-urlsearchparams-append-name-value-name), [USVString](https://webidl.spec.whatwg.org/#idl-USVString) [`value`](#dom-urlsearchparams-append-name-value-value));
  [undefined](https://webidl.spec.whatwg.org/#idl-undefined) [delete](#dom-urlsearchparams-delete)([USVString](https://webidl.spec.whatwg.org/#idl-USVString) [`name`](#dom-urlsearchparams-delete-name-value-name), optional [USVString](https://webidl.spec.whatwg.org/#idl-USVString) [`value`](#dom-urlsearchparams-delete-name-value-value));
  [USVString](https://webidl.spec.whatwg.org/#idl-USVString)? [get](#dom-urlsearchparams-get)([USVString](https://webidl.spec.whatwg.org/#idl-USVString) [`name`](#dom-urlsearchparams-get-name-name));
  [sequence](https://webidl.spec.whatwg.org/#idl-sequence)<[USVString](https://webidl.spec.whatwg.org/#idl-USVString)> [getAll](#dom-urlsearchparams-getall)([USVString](https://webidl.spec.whatwg.org/#idl-USVString) [`name`](#dom-urlsearchparams-getall-name-name));
  [boolean](https://webidl.spec.whatwg.org/#idl-boolean) [has](#dom-urlsearchparams-has)([USVString](https://webidl.spec.whatwg.org/#idl-USVString) [`name`](#dom-urlsearchparams-has-name-value-name), optional [USVString](https://webidl.spec.whatwg.org/#idl-USVString) [`value`](#dom-urlsearchparams-has-name-value-value));
  [undefined](https://webidl.spec.whatwg.org/#idl-undefined) [set](#dom-urlsearchparams-set)([USVString](https://webidl.spec.whatwg.org/#idl-USVString) [`name`](#dom-urlsearchparams-set-name-value-name), [USVString](https://webidl.spec.whatwg.org/#idl-USVString) [`value`](#dom-urlsearchparams-set-name-value-value));

  [undefined](https://webidl.spec.whatwg.org/#idl-undefined) [sort](#dom-urlsearchparams-sort)();

  [iterable](https://webidl.spec.whatwg.org/#dfn-iterable)<[USVString](https://webidl.spec.whatwg.org/#idl-USVString), [USVString](https://webidl.spec.whatwg.org/#idl-USVString)>;
  [stringifier](#urlsearchparams-stringification-behavior);
};

```

  
   **✔**MDN
   

    
[URL/URL](https://developer.mozilla.org/en-US/docs/Web/API/URL/URL)

    
In all current engines.

    

     Firefox26+Safari14.1+Chrome19+
     
---

     Opera?Edge79+
     
---

     Edge (Legacy)12+IENone
     
---

     Firefox for Android?iOS Safari?Chrome for Android?Android WebView?Samsung Internet?Opera Mobile?
     
---

     Node.js10.0.0+
    
   
  
  
   MDN
   

    
[URL/canParse_static](https://developer.mozilla.org/en-US/docs/Web/API/URL/canParse_static)

    

     Firefox115+Safari17+ChromeNone
     
---

     Opera?EdgeNone
     
---

     Edge (Legacy)?IENone
     
---

     Firefox for Android?iOS Safari?Chrome for Android?Android WebView?Samsung Internet?Opera Mobile?
     
---

     Node.js20.0.0+
    
   
  
  
   **✔**MDN
   

    
[URL/hash](https://developer.mozilla.org/en-US/docs/Web/API/URL/hash)

    
In all current engines.

    

     Firefox22+Safari7+Chrome32+
     
---

     Opera?Edge79+
     
---

     Edge (Legacy)13+IENone
     
---

     Firefox for Android?iOS Safari?Chrome for Android?Android WebView?Samsung Internet?Opera Mobile?
     
---

     Node.js7.0.0+
    
   
  
  
   **✔**MDN
   

    
[URL/host](https://developer.mozilla.org/en-US/docs/Web/API/URL/host)

    
In all current engines.

    

     Firefox22+Safari7+Chrome32+
     
---

     Opera?Edge79+
     
---

     Edge (Legacy)13+IENone
     
---

     Firefox for Android?iOS Safari?Chrome for Android?Android WebView?Samsung Internet?Opera Mobile?
     
---

     Node.js7.0.0+
    
   
  
  
   **✔**MDN
   

    
[URL/hostname](https://developer.mozilla.org/en-US/docs/Web/API/URL/hostname)

    
In all current engines.

    

     Firefox22+Safari10+Chrome32+
     
---

     Opera?Edge79+
     
---

     Edge (Legacy)13+IENone
     
---

     Firefox for Android?iOS Safari?Chrome for Android?Android WebView?Samsung Internet?Opera Mobile?
     
---

     Node.js7.0.0+
    
   
  
  
   **✔**MDN
   

    
[URL/href](https://developer.mozilla.org/en-US/docs/Web/API/URL/href)

    
In all current engines.

    

     Firefox22+Safari10+Chrome32+
     
---

     Opera?Edge79+
     
---

     Edge (Legacy)13+IENone
     
---

     Firefox for Android?iOS Safari?Chrome for Android?Android WebView?Samsung Internet?Opera Mobile?
     
---

     Node.js7.0.0+
    
   
  
  
   **✔**MDN
   

    
[URL/origin](https://developer.mozilla.org/en-US/docs/Web/API/URL/origin)

    
In all current engines.

    

     Firefox26+Safari10+Chrome32+
     
---

     Opera?Edge79+
     
---

     Edge (Legacy)12+IENone
     
---

     Firefox for Android?iOS Safari?Chrome for Android?Android WebView?Samsung Internet6.0+Opera Mobile?
     
---

     Node.js7.0.0+
    
   
  
  
   **✔**MDN
   

    
[URL/password](https://developer.mozilla.org/en-US/docs/Web/API/URL/password)

    
In all current engines.

    

     Firefox26+Safari10+Chrome32+
     
---

     Opera?Edge79+
     
---

     Edge (Legacy)12+IENone
     
---

     Firefox for Android?iOS Safari?Chrome for Android?Android WebView?Samsung Internet6.0+Opera Mobile?
     
---

     Node.js7.0.0+
    
   
  
  
   **✔**MDN
   

    
[URL/pathname](https://developer.mozilla.org/en-US/docs/Web/API/URL/pathname)

    
In all current engines.

    

     Firefox22+Safari10+Chrome32+
     
---

     Opera?Edge79+
     
---

     Edge (Legacy)13+IENone
     
---

     Firefox for Android?iOS Safari?Chrome for Android?Android WebView?Samsung Internet?Opera Mobile?
     
---

     Node.js7.0.0+
    
   
  
  
   **✔**MDN
   

    
[URL/port](https://developer.mozilla.org/en-US/docs/Web/API/URL/port)

    
In all current engines.

    

     Firefox22+Safari10+Chrome32+
     
---

     Opera?Edge79+
     
---

     Edge (Legacy)13+IENone
     
---

     Firefox for Android?iOS Safari?Chrome for Android?Android WebView?Samsung Internet?Opera Mobile?
     
---

     Node.js7.0.0+
    
   
  
  
   **✔**MDN
   

    
[URL/protocol](https://developer.mozilla.org/en-US/docs/Web/API/URL/protocol)

    
In all current engines.

    

     Firefox22+Safari10+Chrome32+
     
---

     Opera?Edge79+
     
---

     Edge (Legacy)13+IENone
     
---

     Firefox for Android?iOS Safari?Chrome for Android?Android WebView?Samsung Internet?Opera Mobile?
     
---

     Node.js7.0.0+
    
   
  
  
   **✔**MDN
   

    
[URL/search](https://developer.mozilla.org/en-US/docs/Web/API/URL/search)

    
In all current engines.

    

     Firefox22+Safari10+Chrome32+
     
---

     Opera?Edge79+
     
---

     Edge (Legacy)13+IENone
     
---

     Firefox for Android?iOS Safari?Chrome for Android?Android WebView?Samsung Internet?Opera Mobile?
     
---

     Node.js7.0.0+
    
   
  
  
   **✔**MDN
   

    
[URL/searchParams](https://developer.mozilla.org/en-US/docs/Web/API/URL/searchParams)

    
In all current engines.

    

     Firefox29+Safari10.1+Chrome51+
     
---

     Opera?Edge79+
     
---

     Edge (Legacy)17+IENone
     
---

     Firefox for Android?iOS Safari?Chrome for Android?Android WebView?Samsung Internet?Opera Mobile?
     
---

     Node.js7.5.0+
    
   
  
  
   **✔**MDN
   

    
[URL/toJSON](https://developer.mozilla.org/en-US/docs/Web/API/URL/toJSON)

    
In all current engines.

    

     Firefox54+Safari11+Chrome71+
     
---

     Opera?Edge79+
     
---

     Edge (Legacy)17+IENone
     
---

     Firefox for Android?iOS Safari?Chrome for Android?Android WebView?Samsung Internet?Opera Mobile?
     
---

     Node.js7.7.0+
    
   
  
  
   **✔**MDN
   

    
[URL/toString](https://developer.mozilla.org/en-US/docs/Web/API/URL/toString)

    
In all current engines.

    

     Firefox54+Safari7+Chrome19+
     
---

     Opera?Edge79+
     
---

     Edge (Legacy)17+IENone
     
---

     Firefox for Android?iOS Safari?Chrome for Android?Android WebView?Samsung Internet6.0+Opera Mobile?
     
---

     Node.js7.0.0+
    
   
  
  
   **✔**MDN
   

    
[URL/username](https://developer.mozilla.org/en-US/docs/Web/API/URL/username)

    
In all current engines.

    

     Firefox26+Safari10+Chrome32+
     
---

     Opera?Edge79+
     
---

     Edge (Legacy)12+IENone
     
---

     Firefox for Android?iOS Safari?Chrome for Android?Android WebView?Samsung Internet6.0+Opera Mobile?
     
---

     Node.js7.0.0+
    
   
  
  
   **✔**MDN
   

    
[URL](https://developer.mozilla.org/en-US/docs/Web/API/URL)

    
In all current engines.

    

     Firefox19+Safari7+Chrome32+
     
---

     Opera?Edge79+
     
---

     Edge (Legacy)12+IE10+
     
---

     Firefox for Android?iOS Safari?Chrome for Android?Android WebView4.4+Samsung Internet?Opera Mobile?
     
---

     Node.js10.0.0+
    
   
  
  
   **✔**MDN
   

    
[URLSearchParams/URLSearchParams](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams/URLSearchParams)

    
In all current engines.

    

     Firefox29+Safari10.1+Chrome49+
     
---

     Opera?Edge79+
     
---

     Edge (Legacy)17+IENone
     
---

     Firefox for Android?iOS Safari?Chrome for Android?Android WebView?Samsung Internet?Opera Mobile?
     
---

     Node.js7.5.0+
    
   
   

    
[URLSearchParams/entries](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams/entries)

    
In all current engines.

    

     Firefox44+Safari10.1+Chrome49+
     
---

     Opera?Edge79+
     
---

     Edge (Legacy)17+IENone
     
---

     Firefox for Android?iOS Safari?Chrome for Android?Android WebView?Samsung Internet?Opera Mobile?
     
---

     Node.js7.5.0+
    
   
   

    
[URLSearchParams/forEach](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams/forEach)

    
In all current engines.

    

     Firefox44+Safari10.1+Chrome49+
     
---

     Opera?Edge79+
     
---

     Edge (Legacy)17+IENone
     
---

     Firefox for Android?iOS Safari?Chrome for Android?Android WebView?Samsung Internet?Opera Mobile?
     
---

     Node.js7.5.0+
    
   
   

    
[URLSearchParams/keys](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams/keys)

    
In all current engines.

    

     Firefox44+Safari10.1+Chrome49+
     
---

     Opera?Edge79+
     
---

     Edge (Legacy)17+IENone
     
---

     Firefox for Android?iOS Safari?Chrome for Android?Android WebView?Samsung Internet?Opera Mobile?
     
---

     Node.js7.5.0+
    
   
   

    
[URLSearchParams/values](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams/values)

    
In all current engines.

    

     Firefox44+Safari10.1+Chrome49+
     
---

     Opera?Edge79+
     
---

     Edge (Legacy)17+IENone
     
---

     Firefox for Android?iOS Safari?Chrome for Android?Android WebView?Samsung Internet?Opera Mobile?
     
---

     Node.js7.5.0+
    
   
  
  
   **✔**MDN
   

    
[URLSearchParams/append](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams/append)

    
In all current engines.

    

     Firefox29+Safari10.1+Chrome49+
     
---

     Opera?Edge79+
     
---

     Edge (Legacy)17+IENone
     
---

     Firefox for Android?iOS Safari?Chrome for Android?Android WebView?Samsung Internet?Opera Mobile?
     
---

     Node.js7.5.0+
    
   
  
  
   **✔**MDN
   

    
[URLSearchParams/delete](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams/delete)

    
In all current engines.

    

     Firefox29+Safari14+Chrome49+
     
---

     Opera?Edge79+
     
---

     Edge (Legacy)17+IENone
     
---

     Firefox for Android?iOS Safari?Chrome for Android?Android WebView?Samsung Internet?Opera Mobile?
     
---

     Node.js7.5.0+
    
   
  
  
   **✔**MDN
   

    
[URLSearchParams/get](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams/get)

    
In all current engines.

    

     Firefox29+Safari10.1+Chrome49+
     
---

     Opera?Edge79+
     
---

     Edge (Legacy)17+IENone
     
---

     Firefox for Android?iOS Safari?Chrome for Android?Android WebView?Samsung Internet?Opera Mobile?
     
---

     Node.js7.5.0+
    
   
  
  
   **✔**MDN
   

    
[URLSearchParams/getAll](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams/getAll)

    
In all current engines.

    

     Firefox29+Safari10.1+Chrome49+
     
---

     Opera?Edge79+
     
---

     Edge (Legacy)17+IENone
     
---

     Firefox for Android?iOS Safari?Chrome for Android?Android WebView?Samsung Internet?Opera Mobile?
     
---

     Node.js7.5.0+
    
   
  
  
   **✔**MDN
   

    
[URLSearchParams/has](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams/has)

    
In all current engines.

    

     Firefox29+Safari10.1+Chrome49+
     
---

     Opera?Edge79+
     
---

     Edge (Legacy)17+IENone
     
---

     Firefox for Android?iOS Safari?Chrome for Android?Android WebView?Samsung Internet?Opera Mobile?
     
---

     Node.js7.5.0+
    
   
  
  
   **✔**MDN
   

    
[URLSearchParams/set](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams/set)

    
In all current engines.

    

     Firefox29+Safari10.1+Chrome49+
     
---

     Opera?Edge79+
     
---

     Edge (Legacy)17+IENone
     
---

     Firefox for Android?iOS Safari?Chrome for Android?Android WebView?Samsung Internet?Opera Mobile?
     
---

     Node.js7.5.0+
    
   
  
  
   **✔**MDN
   

    
[URLSearchParams/size](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams/size)

    
In all current engines.

    

     Firefox112+Safari17+Chrome113+
     
---

     Opera?Edge113+
     
---

     Edge (Legacy)?IENone
     
---

     Firefox for Android?iOS Safari?Chrome for Android?Android WebView?Samsung Internet?Opera Mobile?
     
---

     Node.js19.0.0+
    
   
  
  
   **✔**MDN
   

    
[URLSearchParams/sort](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams/sort)

    
In all current engines.

    

     Firefox54+Safari11+Chrome61+
     
---

     Opera?Edge79+
     
---

     Edge (Legacy)17+IENone
     
---

     Firefox for Android?iOS Safari?Chrome for Android?Android WebView?Samsung Internet?Opera Mobile?
     
---

     Node.js7.7.0+
    
   
  
  
   **✔**MDN
   

    
[URLSearchParams/toString](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams/toString)

    
In all current engines.

    

     Firefox29+Safari10.1+Chrome49+
     
---

     Opera?Edge79+
     
---

     Edge (Legacy)17+IENone
     
---

     Firefox for Android?iOS Safari?Chrome for Android?Android WebView?Samsung Internet?Opera Mobile?
     
---

     Node.js7.5.0+
    
   
  
  
   **✔**MDN
   

    
[URLSearchParams](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams)

    
In all current engines.

    

     Firefox29+Safari10.1+Chrome49+
     
---

     Opera?Edge79+
     
---

     Edge (Legacy)17+IENone
     
---

     Firefox for Android?iOS Safari?Chrome for Android?Android WebView?Samsung Internet?Opera Mobile?
     
---

     Node.js10.0.0+
